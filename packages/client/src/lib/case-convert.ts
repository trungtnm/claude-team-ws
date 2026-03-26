export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

export function camelToSnake(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function convertKeys<T>(obj: unknown, converter: (key: string) => string): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeys(item, converter)) as T
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([key]) => !DANGEROUS_KEYS.has(key))
        .map(([key, value]) => [
          converter(key),
          convertKeys(value, converter),
        ]),
    ) as T
  }
  return obj as T
}

export function toCamelCase<T>(obj: unknown): T {
  return convertKeys<T>(obj, snakeToCamel)
}

export function toSnakeCase<T>(obj: unknown): T {
  return convertKeys<T>(obj, camelToSnake)
}
