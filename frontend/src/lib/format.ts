// Display helpers. US units are primary; metric equivalents are secondary.

const KM_PER_MILE = 1.609344
const MM_PER_INCH = 25.4
const KG_PER_LB = 0.45359237

const number = (value: number, digits = 0) =>
  value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export interface Measure {
  primary: string
  secondary: string
}

export const formatMiles = (miles: number): Measure => ({
  primary: `${number(miles)} mi`,
  secondary: `${number(miles * KM_PER_MILE)} km`,
})

export const formatSpeed = (mph: number): Measure => ({
  primary: `${number(mph)} mph`,
  secondary: `${number(mph * KM_PER_MILE)} km/h`,
})

export const formatPrecipitation = (inchesPerHour: number): Measure => ({
  primary: `${number(inchesPerHour, 2)} in/hr`,
  secondary: `${number(inchesPerHour * MM_PER_INCH, 1)} mm/hr`,
})

export const formatTemperature = (fahrenheit: number): Measure => ({
  primary: `${number(fahrenheit)}°F`,
  secondary: `${number(((fahrenheit - 32) * 5) / 9)}°C`,
})

export const formatWeight = (pounds: number): Measure => ({
  primary: `${number(pounds)} lb`,
  secondary: `${number(pounds * KG_PER_LB)} kg`,
})

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`
}

const timeFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

/** e.g. "Sat 2:40 PM CDT", in the viewer's time zone. */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

/** Value for an <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

// WMO weather interpretation codes used by Open-Meteo.
const WEATHER_CODES: [number[], string][] = [
  [[0], 'Clear'],
  [[1, 2], 'Partly cloudy'],
  [[3], 'Overcast'],
  [[45, 48], 'Fog'],
  [[51, 53, 55, 56, 57], 'Drizzle'],
  [[61, 63, 65, 66, 67], 'Rain'],
  [[71, 73, 75, 77], 'Snow'],
  [[80, 81, 82], 'Rain showers'],
  [[85, 86], 'Snow showers'],
  [[95, 96, 99], 'Thunderstorm'],
]

export function describeWeather(code: number): string {
  return WEATHER_CODES.find(([codes]) => codes.includes(code))?.[1] ?? 'Unknown'
}
