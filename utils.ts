import path from "path";

export function pathJoin(dir: string, subpath: string): string {
  const result = path.join(dir, subpath);
  // it seems that obsidian do not understand paths with backslashes in Windows, so turn them into forward slashes
  return result.replace(/\\/g, "/");
}

export function analyseSrcLines(str: string): number[] {
	str = str.replace(/\s*/g, "")
	const result: number[] = []

	let strs = str.split(",")
	strs.forEach(it => {
		if(/\w+-\w+/.test(it)) {
			let left = Number(it.split('-')[0])
			let right = Number(it.split('-')[1])
			for(let i = left; i <= right; i++) {
				result.push(i)
			}
			result.push(0) // three dots
		} else {
			result.push(Number(it))
			result.push(0) // three dots
		}
	})

	return result
}

export function extractSrcLines(fullSrc: string,  srcLinesNum: number[]): string {
    let src = ""

    const fullSrcLines = fullSrc.split("\n")
	const fullSrcLinesLen = fullSrcLines.length

	srcLinesNum.forEach((lineNum, index, arr) => {
		if (lineNum > fullSrcLinesLen) {
		  arr.splice(index, 1);
		}
	});

	srcLinesNum.forEach((lineNum, index, arr) => {
		if (lineNum == 0 && arr[index-1] == 0) {
		  arr.splice(index, 1);
		}
	});
	
    srcLinesNum.forEach((lineNum, index) => {
		if (lineNum > fullSrcLinesLen) {
			return
		}

		if (index == srcLinesNum.length-1 && lineNum == 0 && srcLinesNum[index-1] == fullSrcLinesLen) {
			return
		} 

		if (index == 0 && lineNum != 1) {
			src = '...' + '\n' + fullSrcLines[lineNum-1]
			return
		}
		
		// zeros is dots (analyseSrcLines)
        if (lineNum == 0 ) {
			src = src + '\n' + '...'
			return
		}

		if (index == 0) {
			src = fullSrcLines[lineNum-1]
		} else {
			src = src + '\n' + fullSrcLines[lineNum-1]
		}
	});

    return src
}

export type LineEntry = { lineNum: number; text: string } | { gap: true }

export function buildLineEntries(fullSrc: string, srcLinesNum: number[]): LineEntry[] {
	const srcLines = fullSrc.split(/\r?\n/)
	const total = srcLines.length

	let nums = srcLinesNum.filter(n => n === 0 || (n >= 1 && n <= total))
	nums = nums.filter((n, i, arr) => !(n === 0 && i > 0 && arr[i - 1] === 0))

	// Strip leading and trailing zeros — '...' only belongs between blocks, not at the edges
	while (nums.length > 0 && nums[0] === 0) nums = nums.slice(1)
	while (nums.length > 0 && nums[nums.length - 1] === 0) nums = nums.slice(0, -1)

	if (nums.length === 0) return []

	const result: LineEntry[] = []
	for (const n of nums) {
		if (n === 0) result.push({ gap: true })
		else result.push({ lineNum: n, text: srcLines[n - 1] })
	}

	return result.filter((e, i, arr) => !('gap' in e) || i === 0 || !('gap' in arr[i - 1]))
}

export type RegionsResult = { ok: true; entries: LineEntry[] } | { ok: false; error: string }

export function extractRegions(fullSrc: string, regionsSpec: string): RegionsResult {
	const lines = fullSrc.split(/\r?\n/)
	const startRe = /^\s*(?:\/\/|#|<!--)\s*#region\s+(.+?)\s*(?:-->)?\s*$/i
	const endRe   = /^\s*(?:\/\/|#|<!--)\s*#endregion\b/i

	const segments = regionsSpec.split(',').map(s => s.trim()).filter(s => s.length > 0)
	const parts: LineEntry[][] = []

	for (const segment of segments) {
		if (/^\d+$/.test(segment)) {
			const lineNum = parseInt(segment)
			if (lineNum >= 1 && lineNum <= lines.length) {
				parts.push([{ lineNum, text: lines[lineNum - 1] }])
			}
		} else if (/^\d+-\d+$/.test(segment)) {
			const [left, right] = segment.split('-').map(Number)
			const lo = Math.max(1, left)
			const hi = Math.min(lines.length, right)
			if (lo <= hi) {
				const seg: LineEntry[] = []
				for (let i = lo; i <= hi; i++) seg.push({ lineNum: i, text: lines[i - 1] })
				parts.push(seg)
			}
		} else {
			let startIndex = -1
			for (let i = 0; i < lines.length; i++) {
				const m = lines[i].match(startRe)
				if (m && m[1].trim() === segment) { startIndex = i; break }
			}
			if (startIndex === -1) return { ok: false, error: `region '${segment}' not found` }

			let endIndex = -1
			for (let j = startIndex + 1; j < lines.length; j++) {
				if (endRe.test(lines[j])) { endIndex = j; break }
			}
			if (endIndex === -1) return { ok: false, error: `region '${segment}' has no matching #endregion` }

			const seg: LineEntry[] = [{ lineNum: startIndex + 1, text: lines[startIndex] }]
			for (let i = startIndex + 1; i <= endIndex; i++) seg.push({ lineNum: i + 1, text: lines[i] })
			parts.push(seg)
		}
	}

	if (parts.length === 0) return { ok: true, entries: [] }

	const entries: LineEntry[] = []
	for (let i = 0; i < parts.length; i++) {
		if (i > 0) entries.push({ gap: true })
		entries.push(...parts[i])
	}

	return { ok: true, entries }
}
