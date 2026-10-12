import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Building2, ChevronDown, ChevronRight, ChevronUp, Download, FileDown, List, Map as MapIcon, Plus, Trash2, Upload, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card, inputClass } from '../components/ui'
import { downloadTextFile, parseCsv, toCsv, type CsvRow } from '../lib/csv'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import LocationMap from '../components/LocationMap'
import { calculateAccessibilityScore, calculateRiskScore, calculateMaximumLocationScore, classifyUrbanRural, temporalAccessScore } from '../lib/calculations'

type MachineStatus = 'Planned' | 'Active' | 'Inactive' | 'Removed'

type LocationDemographicRecord = {
  zip_population?: number | null
  population_density?: number | null
  zip_crime_rate?: number | null
  usda_hardiness_zone?: number | null
  risk_score: number | null
  maximum_location_score?: number | null
  urban_rural_flag?: string | null
}

type LocationAccessRecord = {
  public_access_score?: number | null
  physical_access_score?: number | null
  accessible_hours_per_week?: number | null
  visibility_score?: number | null
  machine_accessibility_score: number | null
}

type LocationRecord = {
  id?: string
  machine_id: string
  agency: string
  location_name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  latitude: number | null
  longitude: number | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  machine_status: MachineStatus
  cluster_id: string | null
  population_served: number
  location_demographics?: LocationDemographicRecord[] | LocationDemographicRecord | null
  location_access_scores?: LocationAccessRecord[] | LocationAccessRecord | null
  created_at?: string
  updated_at?: string
}

type ImportIssue = { row: number; machineId: string; message: string }
type ImportSummary = { total: number; accepted: number; rejected: number; issues: ImportIssue[] }
type AgencyGroup = { agency: string; rows: LocationRecord[] }

const headers = [
  'machine_id', 'agency', 'location_name', 'address', 'city', 'state', 'zip', 'latitude', 'longitude',
  'contact_name', 'contact_phone', 'contact_email', 'machine_status', 'cluster_id', 'population_served',
  'public_access_score', 'physical_access_score', 'accessible_hours_per_week', 'visibility_score',
  'zip_population', 'population_density', 'zip_crime_rate', 'usda_hardiness_zone',
]

const statuses: MachineStatus[] = ['Planned', 'Active', 'Inactive', 'Removed']

const demoRows: LocationRecord[] = [
  { id: 'demo-1', machine_id: 'IVM-001', agency: 'County Health Department', location_name: 'Possibility Shop', address: '100 Main St', city: 'Des Moines', state: 'IA', zip: '50309', latitude: 41.5868, longitude: -93.625, contact_name: null, contact_phone: null, contact_email: null, machine_status: 'Active', cluster_id: null, population_served: 214133, location_demographics: [{ risk_score: 0.18, maximum_location_score: 0.72 }], location_access_scores: [{ machine_accessibility_score: 0.90 }] },
  { id: 'demo-2', machine_id: 'IVM-002', agency: 'County Health Department', location_name: 'Community Center', address: '210 Nile Kinnick Dr', city: 'Adel', state: 'IA', zip: '50003', latitude: 41.6144, longitude: -94.0174, contact_name: null, contact_phone: null, contact_email: null, machine_status: 'Active', cluster_id: null, population_served: 6153, location_demographics: [{ risk_score: 0.42, maximum_location_score: 0.40 }], location_access_scores: [{ machine_accessibility_score: 0.82 }] },
]

function nullable(value: string): string | null { return value === '' ? null : value }
function parseOptionalNumber(value: string): number | null {
  if (value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function splitAgency(value: string): { agency: string; facility: string } {
  const trimmed = value.trim()
  const match = trimmed.match(/^(.*?)\s*\((.+)\)\s*$/)
  if (!match) return { agency: trimmed || 'Unassigned Agency', facility: trimmed || 'Unspecified Location' }
  return { agency: match[1].trim() || 'Unassigned Agency', facility: match[2].trim() || 'Unspecified Location' }
}

function relatedRecord<T>(value: T[] | T | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function clampScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null
}

function riskValue(row: LocationRecord): number | null {
  return clampScore(relatedRecord(row.location_demographics)?.risk_score)
}

function accessibilityValue(row: LocationRecord): number | null {
  return clampScore(relatedRecord(row.location_access_scores)?.machine_accessibility_score)
}

function maximumLocationValue(row: LocationRecord): number | null {
  return clampScore(relatedRecord(row.location_demographics)?.maximum_location_score)
}

type DialKind = 'positive' | 'risk'

function ScoreDial({ value, kind = 'positive' }: { value: number | null; kind?: DialKind }) {
  const percent = value == null ? null : Math.round(value * 100)
  const isRisk = kind === 'risk'
  const good = percent != null && (isRisk ? percent <= 30 : percent >= 67)
  const moderate = percent != null && (isRisk ? percent <= 60 : percent >= 34) && !good
  const label = percent == null
    ? 'Not scored'
    : isRisk
      ? good ? 'Low Risk' : moderate ? 'Moderate Risk' : 'High Risk'
      : good ? 'High' : moderate ? 'Moderate' : 'Low'
  const stroke = percent == null ? '#94a3b8' : good ? '#10b981' : moderate ? '#f59e0b' : '#ef4444'
  const labelClass = percent == null ? 'text-slate-400' : good ? 'text-emerald-600' : moderate ? 'text-amber-500' : 'text-rose-500'
  const circumference = Math.PI * 42
  const filled = percent == null ? 0 : (circumference * percent) / 100

  return <div className="flex min-w-[112px] flex-col items-center">
    <div className="relative h-[58px] w-[100px] overflow-hidden">
      <svg viewBox="0 0 100 56" className="h-full w-full" aria-label={`${percent ?? 0}% ${label}`}>
        <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round"/>
        <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${filled} ${circumference}`}/>
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center text-lg font-bold text-slate-900">{percent == null ? '—' : `${percent}%`}</div>
    </div>
    <span className={`mt-1 text-xs font-semibold ${labelClass}`}>{label}</span>
  </div>
}

function validateAndMap(row: CsvRow, rowNumber: number): { record?: LocationRecord; issue?: ImportIssue } {
  const machineId = row.machine_id?.trim() ?? ''
  let agency = row.agency?.trim() ?? ''
  let locationName = row.location_name?.trim() ?? ''
  if (!locationName) {
    const legacy = splitAgency(agency)
    agency = legacy.agency
    locationName = legacy.facility
  }
  const status = (row.machine_status?.trim() || 'Planned') as MachineStatus
  const latitude = parseOptionalNumber(row.latitude ?? '')
  const longitude = parseOptionalNumber(row.longitude ?? '')
  const population = row.population_served === '' || row.population_served == null ? 0 : Number(row.population_served)

  if (!machineId) return { issue: { row: rowNumber, machineId: '', message: 'machine_id is required.' } }
  if (!agency) return { issue: { row: rowNumber, machineId, message: 'agency is required.' } }
  if (!locationName) return { issue: { row: rowNumber, machineId, message: 'location_name is required.' } }
  if (!statuses.includes(status)) return { issue: { row: rowNumber, machineId, message: `machine_status must be one of: ${statuses.join(', ')}.` } }
  if (row.latitude && latitude == null) return { issue: { row: rowNumber, machineId, message: 'latitude must be numeric.' } }
  if (row.longitude && longitude == null) return { issue: { row: rowNumber, machineId, message: 'longitude must be numeric.' } }
  if (!Number.isInteger(population) || population < 0) return { issue: { row: rowNumber, machineId, message: 'population_served must be a whole number at or above 0.' } }

  return { record: {
    machine_id: machineId, agency, location_name: locationName, address: nullable(row.address ?? ''), city: nullable(row.city ?? ''), state: nullable(row.state ?? ''), zip: nullable(row.zip ?? ''),
    latitude, longitude, contact_name: nullable(row.contact_name ?? ''), contact_phone: nullable(row.contact_phone ?? ''), contact_email: nullable(row.contact_email ?? ''),
    machine_status: status, cluster_id: nullable(row.cluster_id ?? ''), population_served: population,
  } }
}

export default function Locations() {
  const [rows, setRows] = useState<LocationRecord[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [view, setView] = useState<'table' | 'map'>('table')
  const [mapMetric, setMapMetric] = useState<'accessibility' | 'risk' | 'maximum'>('maximum')
  const [deleteTarget, setDeleteTarget] = useState<AgencyGroup | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletingAgency, setDeletingAgency] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadLocations = async () => {
    setLoading(true)
    setMessage('')
    if (!supabase) {
      setRows(demoRows)
      setMessage('Supabase is not configured, so demonstration locations are displayed.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('locations')
      .select('*, location_access_scores(*), location_demographics(*)')
      .order('agency', { ascending: true })
      .order('machine_id', { ascending: true })

    if (error) setMessage(error.message)
    else setRows((data ?? []) as LocationRecord[])
    setLoading(false)
  }

  useEffect(() => { void loadLocations() }, [])

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim()
    if (!term) return rows
    return rows.filter((row) => Object.values(row).join(' ').toLowerCase().includes(term))
  }, [query, rows])

  const agencyGroups = useMemo<AgencyGroup[]>(() => {
    const groups = new Map<string, LocationRecord[]>()
    filtered.forEach((row) => {
      const agency = row.agency?.trim() || 'Unassigned Agency'
      const current = groups.get(agency) ?? []
      current.push(row)
      groups.set(agency, current)
    })
    return [...groups.entries()]
      .map(([agency, groupRows]) => ({ agency, rows: groupRows.sort((a, b) => a.machine_id.localeCompare(b.machine_id)) }))
      .sort((a, b) => a.agency.localeCompare(b.agency))
  }, [filtered])

  const deleteAgency = async () => {
    if (!deleteTarget || deleteConfirmation.trim() !== deleteTarget.agency) return
    if (!supabase) {
      setMessage('Supabase is not configured. Agency deletion is unavailable.')
      return
    }

    setDeletingAgency(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('delete_agency_cascade', {
        p_agency: deleteTarget.agency,
        p_confirmation: deleteConfirmation.trim(),
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      const deletedAgency = deleteTarget.agency
      const fallbackCount = deleteTarget.rows.length
      setDeleteTarget(null)
      setDeleteConfirmation('')
      setMessage(`Deleted ${result?.deleted_locations ?? fallbackCount} location(s) and all machine-linked records for ${deletedAgency}.`)
      await loadLocations()
    } catch (error) {
      setMessage(error instanceof Error ? `Agency deletion failed: ${error.message}` : 'Agency deletion failed.')
    } finally {
      setDeletingAgency(false)
    }
  }

  const assessmentFields = ['public_access_score', 'physical_access_score', 'accessible_hours_per_week', 'visibility_score', 'zip_population', 'population_density', 'zip_crime_rate', 'usda_hardiness_zone'] as const
  const accessCategories: Record<string, Record<string, string>> = {
    public_access_score: { '1': 'Fully public', '0.8': 'Time-limited public', '0.5': 'Semi-public', '0.2': 'Private/gated', '0': 'Highly restricted' },
    physical_access_score: { '1': 'Indoor, step-free', '0.8': 'Outdoor, step-free', '0.5': 'Minor barriers', '0.2': 'Significant barriers', '0': 'Inaccessible' },
    visibility_score: { '1': 'High', '0.6': 'Moderate', '0.3': 'Low', '0': 'Hidden' },
  }
  const validateAssessment = (row: CsvRow): string | null => {
    for (const key of assessmentFields) {
      const raw = row[key]?.trim()
      if (!raw) continue
      const value = Number(raw)
      if (!Number.isFinite(value)) return `${key} must be numeric.`
      if (accessCategories[key] && !(String(value) in accessCategories[key])) return `${key} must be one of ${Object.keys(accessCategories[key]).join(', ')}.`
      if (key === 'accessible_hours_per_week' && (value < 0 || value > 168)) return `${key} must be between 0 and 168.`
      if (key === 'zip_crime_rate' && (value < 0 || value > 100)) return `${key} must be between 0 and 100.`
      if (key === 'usda_hardiness_zone' && (value < 1 || value > 13)) return `${key} must be between 1 and 13.`
      if (['zip_population', 'population_density'].includes(key) && value < 0) return `${key} cannot be negative.`
    }
    return null
  }
  const saveAssessment = async (machineId: string, csv: CsvRow, locationId: string) => {
    if (!supabase || !assessmentFields.some((key) => csv[key]?.trim())) return
    const [{ data: access, error: accessReadError }, { data: demo, error: demoReadError }] = await Promise.all([
      supabase.from('location_access_scores').select('*').eq('location_id', locationId).maybeSingle(),
      supabase.from('location_demographics').select('*').eq('location_id', locationId).maybeSingle(),
    ])
    if (accessReadError || demoReadError) throw new Error(`${machineId}: ${accessReadError?.message || demoReadError?.message}`)
    const val = (key: typeof assessmentFields[number], existing: number | null | undefined, fallback: number) => csv[key]?.trim() ? Number(csv[key]) : Number(existing ?? fallback)
    const pub = val('public_access_score', access?.public_access_score, 1)
    const phys = val('physical_access_score', access?.physical_access_score, 1)
    const hours = val('accessible_hours_per_week', access?.accessible_hours_per_week, 168)
    const visibility = val('visibility_score', access?.visibility_score, 1)
    const population = val('zip_population', demo?.zip_population, 0)
    const density = val('population_density', demo?.population_density, 0)
    const crime = val('zip_crime_rate', demo?.zip_crime_rate, 0)
    const zone = val('usda_hardiness_zone', demo?.usda_hardiness_zone, 5)
    const accessibility = calculateAccessibilityScore({ publicAccess: pub, physicalAccess: phys, hours, visibility }, { publicAccess: .35, physicalAccess: .25, temporalAccess: .2, visibility: .2 })
    const risk = calculateRiskScore({ population, crime, zone }, { populationMin: 0, populationMax: 100000, crimeMin: 0, crimeMax: 100, zoneMin: 1, zoneMax: 13, zoneMid: 7 }, { population: .3, crime: .5, climate: .2 })
    const accessPayload = { location_id: locationId, availability_tier: access?.availability_tier ?? 'High', public_access_category: accessCategories.public_access_score[String(pub)], public_access_score: pub, physical_access_category: accessCategories.physical_access_score[String(phys)], physical_access_score: phys, accessible_hours_per_week: hours, temporal_access_score: temporalAccessScore(hours), visibility_category: accessCategories.visibility_score[String(visibility)], visibility_score: visibility, machine_accessibility_score: accessibility }
    const demoPayload = { location_id: locationId, housing_unit_density: demo?.housing_unit_density ?? 0, population_density: density, contiguous_housing_units: demo?.contiguous_housing_units ?? 0, contiguous_population: demo?.contiguous_population ?? 0, urban_rural_flag: classifyUrbanRural({ populationDensity: density }), zip_population: population, zip_crime_rate: crime, usda_hardiness_zone: zone, normalized_population_score: risk.normalizedPopulation, normalized_crime_score: risk.normalizedCrime, normalized_climate_risk_score: risk.normalizedClimate, risk_score: risk.riskScore, maximum_location_score: calculateMaximumLocationScore(accessibility, risk.riskScore) }
    const a = await supabase.from('location_access_scores').upsert(accessPayload, { onConflict: 'location_id' })
    if (a.error) throw new Error(`${machineId}: accessibility save failed: ${a.error.message}`)
    const d = await supabase.from('location_demographics').upsert(demoPayload, { onConflict: 'location_id' })
    if (d.error) throw new Error(`${machineId}: demographics save failed: ${d.error.message}`)
  }
  const exportLocations = () => downloadTextFile(`ivm-optim-locations-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(filtered.map((row) => ({ ...row, ...relatedRecord(row.location_access_scores), ...relatedRecord(row.location_demographics) })) as Record<string, unknown>[], headers))
  const downloadTemplate = () => downloadTextFile('ivm-optim-location-import-template.csv', toCsv([{
    machine_id: 'IVM-100', agency: 'Example Agency', location_name: 'Example Facility', address: '123 Main St', city: 'Des Moines', state: 'IA', zip: '50309', latitude: '41.5868', longitude: '-93.6250', contact_name: '', contact_phone: '', contact_email: '', machine_status: 'Planned', cluster_id: '', population_served: '10000', public_access_score: '1', physical_access_score: '1', accessible_hours_per_week: '168', visibility_score: '1', zip_population: '19076', population_density: '1500', zip_crime_rate: '88', usda_hardiness_zone: '5',
  }], headers))

  const importLocations = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setLoading(true); setMessage(''); setSummary(null)
    try {
      const parsed = parseCsv(await file.text())
      const missingHeaders = ['machine_id', 'agency', 'location_name'].filter((header) => !Object.prototype.hasOwnProperty.call(parsed[0] ?? {}, header))
      if (missingHeaders.length) throw new Error(`Missing required CSV column(s): ${missingHeaders.join(', ')}`)
      const records: { record: LocationRecord; csv: CsvRow; rowNumber: number }[] = []
      const issues: ImportIssue[] = []
      const seen = new Set<string>()
      parsed.forEach((row, index) => {
        const result = validateAndMap(row, index + 2)
        const problem = validateAssessment(row)
        const machineId = row.machine_id?.trim() ?? ''
        if (result.issue) issues.push(result.issue)
        else if (problem) issues.push({ row: index + 2, machineId, message: problem })
        else if (seen.has(machineId)) issues.push({ row: index + 2, machineId, message: 'Duplicate machine_id in CSV.' })
        else if (result.record) { seen.add(machineId); records.push({ record: result.record, csv: row, rowNumber: index + 2 }) }
      })
      let accepted = 0
      if (!supabase) {
        setRows((current) => { const byMachine = new Map(current.map((row) => [row.machine_id, row])); records.forEach(({ record }) => byMachine.set(record.machine_id, record)); return [...byMachine.values()].sort((a, b) => a.machine_id.localeCompare(b.machine_id)) })
        accepted = records.length
        setMessage('Preview completed locally. Configure Supabase and sign in to save imported records.')
      } else {
        for (const { record, csv, rowNumber } of records) {
          try {
            // Merge existing values so empty optional columns do not erase data.
            const { data: existing, error: lookupError } = await supabase.from('locations').select('*').eq('machine_id', record.machine_id).maybeSingle()
            if (lookupError) throw lookupError
            const merged = { ...record } as Record<string, unknown>
            if (existing) for (const key of headers.slice(1, 15)) if (!csv[key]?.trim()) merged[key] = existing[key]
            const { data: saved, error } = await supabase.from('locations').upsert(merged, { onConflict: 'machine_id' }).select('id').single()
            if (error) throw error
            await saveAssessment(record.machine_id, csv, saved.id)
            accepted++
          } catch (error) { issues.push({ row: rowNumber, machineId: record.machine_id, message: error instanceof Error ? error.message : 'Save failed.' }) }
        }
        setMessage(`${accepted} location record(s) saved; ${issues.length} rejected or partially failed. Review errors before retrying.`)
        await loadLocations()
      }
      setSummary({ total: parsed.length, accepted, rejected: issues.length, issues })
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The CSV could not be imported.') }
    finally { setLoading(false) }
  }

  return <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Locations</h1>
      <p className="text-slate-500">Agencies and deployed machines with location risk assessment.</p>
    </div>

    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
        <input
          className={`${inputClass} min-w-[280px] flex-1 py-2`}
          placeholder="Search agencies, facilities, machine IDs, cities, or ZIP..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex shrink-0 rounded-lg bg-slate-100 p-1">
          <button onClick={() => setView('table')} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${view === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><List size={15}/>Table</button>
          <button onClick={() => setView('map')} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${view === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><MapIcon size={15}/>Map</button>
        </div>
        <Link to="/locations/new" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={17}/>Add Location</Link>
        <button onClick={() => fileRef.current?.click()} disabled={loading} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Upload size={17}/>Import / Update CSV</button>
        <button onClick={exportLocations} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download size={17}/>Export CSV</button>
        <button onClick={downloadTemplate} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileDown size={17}/>CSV Template</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importLocations}/>
      </div>
      {view === 'map' && <div className="mt-2 flex justify-end"><select className={`${inputClass} max-w-xs py-2`} value={mapMetric} onChange={(event) => setMapMetric(event.target.value as 'accessibility' | 'risk' | 'maximum')}><option value="maximum">Maximum Location Score</option><option value="accessibility">Accessibility Score</option><option value="risk">Risk Score</option></select></div>}
      {!isSupabaseConfigured && <p className="mt-2 text-xs font-medium text-amber-700">Supabase connection is not configured in this browser session.</p>}
    </Card>

    {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.toLowerCase().includes('error') || message.toLowerCase().includes('missing') ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{message}</div>}

    {summary && <Card><h2 className="font-semibold text-slate-900">Import Summary</h2><div className="mt-3 flex gap-3 text-sm"><Badge tone="blue">{summary.total} rows</Badge><Badge tone="green">{summary.accepted} accepted</Badge><Badge tone={summary.rejected ? 'red' : 'slate'}>{summary.rejected} rejected</Badge></div>{summary.issues.length > 0 && <div className="mt-4 max-h-48 overflow-auto rounded-xl border border-rose-200"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-rose-50 text-rose-700"><tr><th className="px-3 py-2">CSV Row</th><th className="px-3 py-2">Machine ID</th><th className="px-3 py-2">Issue</th></tr></thead><tbody>{summary.issues.map((issue) => <tr key={`${issue.row}-${issue.machineId}`} className="border-t border-rose-100"><td className="px-3 py-2">{issue.row}</td><td className="px-3 py-2">{issue.machineId || '—'}</td><td className="px-3 py-2">{issue.message}</td></tr>)}</tbody></table></div>}</Card>}

    {view === 'map' ? <LocationMap rows={filtered} metric={mapMetric}/> : <div className="space-y-3">
      {agencyGroups.map((group) => {
        const isCollapsed = collapsed[group.agency] ?? true
        const activeCount = group.rows.filter((row) => row.machine_status === 'Active').length
        const average = (values: Array<number | null>) => {
          const present = values.filter((value): value is number => value != null)
          return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null
        }
        const avgAccessibility = average(group.rows.map(accessibilityValue))
        const avgRisk = average(group.rows.map(riskValue))
        const avgMaximum = average(group.rows.map(maximumLocationValue))
        const CompactScore = ({ label, value, kind = 'positive' }: { label: string; value: number | null; kind?: DialKind }) => {
          const percent = value == null ? null : Math.round(value * 100)
          const good = percent != null && (kind === 'risk' ? percent <= 30 : percent >= 67)
          const moderate = percent != null && !good && (kind === 'risk' ? percent <= 60 : percent >= 34)
          const tone = percent == null ? 'border-slate-200 bg-slate-50 text-slate-500' : good ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : moderate ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-rose-200 bg-rose-50 text-rose-700'
          return <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${tone}`}><span className="text-[9px] font-bold uppercase tracking-wide opacity-80">{label}</span><span className="text-sm font-extrabold leading-none">{percent == null ? '—' : `${percent}%`}</span></div>
        }
        return <Card key={group.agency} className="overflow-hidden p-0">
          <div className="flex w-full items-center gap-3 px-4 py-2 hover:bg-slate-50">
            <button type="button" onClick={() => setCollapsed((current) => ({ ...current, [group.agency]: !isCollapsed }))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <div className="rounded-md bg-blue-50 p-1.5 text-blue-600"><Building2 size={16}/></div>
              <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><h2 className="truncate text-sm font-bold text-slate-900">{group.agency}</h2><span className="text-[11px] text-slate-500">{group.rows.length} machine{group.rows.length === 1 ? '' : 's'} · {activeCount} active</span></div></div>
            </button>
            <div className="ml-auto hidden items-center gap-1.5 md:flex"><CompactScore label="Access" value={avgAccessibility}/><CompactScore label="Risk" value={avgRisk} kind="risk"/><CompactScore label="Maximum" value={avgMaximum}/></div>
            <button type="button" onClick={() => { setDeleteTarget(group); setDeleteConfirmation('') }} title={`Delete ${group.agency}`} className="rounded-full border border-rose-200 p-1.5 text-rose-600 transition hover:bg-rose-50"><Trash2 size={14}/></button>
            <button type="button" onClick={() => setCollapsed((current) => ({ ...current, [group.agency]: !isCollapsed }))} className="rounded-full border border-slate-200 p-1 text-slate-500">{isCollapsed ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}</button>
          </div>

          {!isCollapsed && <><div className="flex flex-wrap gap-1.5 border-t border-slate-100 bg-slate-50 px-3 py-1.5 md:hidden"><CompactScore label="Access" value={avgAccessibility}/><CompactScore label="Risk" value={avgRisk} kind="risk"/><CompactScore label="Maximum" value={avgMaximum}/></div><div className="overflow-x-auto border-t border-slate-100"><table className="w-full min-w-[1240px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr>{['Machine ID','Location / Facility','Address','City','State','ZIP','Accessibility','Risk Score','Maximum Location Score',''].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{group.rows.map((row) => { const facility = row.location_name || 'Unspecified Location'; return <tr key={row.machine_id} className="border-t border-slate-100 hover:bg-slate-50/70">
              <td colSpan={10} className="p-0">
                {row.id ? <Link to={`/locations/${row.id}`} className="grid min-w-[1240px] grid-cols-[220px_165px_280px_110px_95px_75px_145px_145px_175px_42px] items-center text-slate-700 transition hover:text-slate-900">
                  <div className="px-4 py-3"><div className="font-bold text-slate-900">{row.machine_id}</div><div className="mt-0.5 text-xs text-slate-500">{facility}</div></div>
                  <div className="px-4 py-3 font-medium">{facility}</div>
                  <div className="px-4 py-3 whitespace-pre-line">{row.address || '—'}</div>
                  <div className="px-4 py-3">{row.city || '—'}</div>
                  <div className="px-4 py-3">{row.state || '—'}</div>
                  <div className="px-4 py-3">{row.zip || '—'}</div>
                  <div className="px-4 py-2"><ScoreDial value={accessibilityValue(row)}/></div>
                  <div className="px-4 py-2"><ScoreDial value={riskValue(row)} kind="risk"/></div>
                  <div className="px-4 py-2"><ScoreDial value={maximumLocationValue(row)}/></div>
                  <div className="flex justify-center px-2 py-3 text-slate-500"><ChevronRight size={20}/></div>
                </Link> : <div className="grid min-w-[1240px] grid-cols-[220px_165px_280px_110px_95px_75px_145px_145px_175px_42px] items-center opacity-70">
                  <div className="px-4 py-3"><div className="font-bold text-slate-900">{row.machine_id}</div><div className="mt-0.5 text-xs text-slate-500">{facility}</div></div>
                  <div className="px-4 py-3">{facility}</div><div className="px-4 py-3">{row.address || '—'}</div><div className="px-4 py-3">{row.city || '—'}</div><div className="px-4 py-3">{row.state || '—'}</div><div className="px-4 py-3">{row.zip || '—'}</div><div className="px-4 py-2"><ScoreDial value={accessibilityValue(row)}/></div><div className="px-4 py-2"><ScoreDial value={riskValue(row)} kind="risk"/></div><div className="px-4 py-2"><ScoreDial value={maximumLocationValue(row)}/></div><div/>
                </div>}
              </td>
            </tr> })}</tbody></table></div></>}
        </Card>
      })}
      {!loading && agencyGroups.length === 0 && <Card><p className="p-4 text-center text-sm text-slate-500">No locations found.</p></Card>}
    </div>}

    <Card><div className="grid gap-4 md:grid-cols-3"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-600">High Score · 67–100%</p><p className="mt-1 text-sm text-slate-600">Strong accessibility or maximum location potential. For risk, lower is better.</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-amber-600">Moderate · 34–66%</p><p className="mt-1 text-sm text-slate-600">Review the underlying access and risk inputs.</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-rose-600">Low Score · 0–33%</p><p className="mt-1 text-sm text-slate-600">Weak accessibility or location potential. A high risk percentage is also shown in red.</p></div></div></Card>

    {deleteTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-agency-title">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 p-5">
          <div className="rounded-full bg-rose-100 p-2 text-rose-700"><AlertTriangle size={22}/></div>
          <div className="min-w-0 flex-1"><h2 id="delete-agency-title" className="text-lg font-bold text-slate-900">Delete agency and all related data?</h2><p className="mt-1 text-sm text-slate-600">This permanently deletes <strong>{deleteTarget.agency}</strong>, its {deleteTarget.rows.length} machine{deleteTarget.rows.length === 1 ? '' : 's'}, and all records linked to those machines.</p></div>
          <button type="button" onClick={() => { if (!deletingAgency) { setDeleteTarget(null); setDeleteConfirmation('') } }} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={20}/></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-bold">The deletion includes:</p><p className="mt-1">Locations, machines, planograms, machine logs, restock history, safety stock, inventory periods, service assignments, demand settings, optimization recommendations, and machine sync mappings. Technicians are retained if they service other agencies.</p></div>
          <label className="block"><span className="text-sm font-semibold text-slate-700">Type the agency name to confirm</span><input autoFocus className={`${inputClass} mt-1`} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={deleteTarget.agency}/></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" disabled={deletingAgency} onClick={() => { setDeleteTarget(null); setDeleteConfirmation('') }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button><button type="button" disabled={deletingAgency || deleteConfirmation.trim() !== deleteTarget.agency} onClick={() => void deleteAgency()} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={16}/>{deletingAgency ? 'Deleting…' : 'Delete agency permanently'}</button></div>
      </div>
    </div>}
  </div>
}
