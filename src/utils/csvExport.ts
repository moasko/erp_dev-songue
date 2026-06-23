type CsvColumn<T> = {
  header: string
  value: (row: T) => string | number | null | undefined
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(',')
  const body = rows.map((row) => columns.map((column) => escapeCsvCell(column.value(row))).join(','))
  const csv = [header, ...body].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function escapeCsvCell(value: string | number | null | undefined) {
  const cell = String(value ?? '')
  if (!/[",\n\r]/.test(cell)) return cell
  return `"${cell.replace(/"/g, '""')}"`
}
