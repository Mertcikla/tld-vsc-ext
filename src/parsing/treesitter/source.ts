export function treeSitterLanguageFromFilePath(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'ts' || ext === 'tsx') return 'typescript'
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'javascript'
  if (ext === 'go') return 'go'
  if (ext === 'py') return 'python'
  if (ext === 'rs') return 'rust'
  if (ext === 'java') return 'java'
  if (ext === 'cs') return 'csharp'
  if (ext === 'cpp' || ext === 'cc' || ext === 'cxx' || ext === 'c' || ext === 'h' || ext === 'hpp') return 'cpp'
  if (ext === 'rb') return 'ruby'
  if (ext === 'vue') return 'vue'
  return null
}

export function extractVueScript(src: string): { content: string; lang: string } | null {
  const tsMatch = /<script[^>]+lang=["']ts["'][^>]*>([\s\S]*?)<\/script>/i.exec(src)
  if (tsMatch) return { content: tsMatch[1], lang: 'typescript' }

  const jsMatch = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i.exec(src)
  return jsMatch ? { content: jsMatch[1], lang: 'javascript' } : null
}

export function prepareTreeSitterSource(filePath: string, rawText: string): { text: string; lang: string } | null {
  const rawLang = treeSitterLanguageFromFilePath(filePath)
  if (!rawLang) return null
  if (rawLang !== 'vue') return { text: rawText, lang: rawLang }
  return extractVueScript(rawText)
}