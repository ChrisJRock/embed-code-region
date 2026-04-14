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

type RegionsResult = { ok: true; content: string } | { ok: false; error: string }

export function extractRegions(fullSrc: string, regionsSpec: string): RegionsResult {
	const lines = fullSrc.split(/\r?\n/)
	const startRe = /^\s*(?:\/\/|#|<!--)\s*#region\s+(.+?)\s*(?:-->)?\s*$/i
	const endRe   = /^\s*(?:\/\/|#|<!--)\s*#endregion\b/i

	const segments = regionsSpec.split(',').map(s => s.trim()).filter(s => s.length > 0)
	const parts: { startLineNum: number; content: string }[] = []

	for (const segment of segments) {
		if (/^\d+$/.test(segment)) {
			const lineNum = parseInt(segment)
			if (lineNum >= 1 && lineNum <= lines.length) {
				parts.push({ startLineNum: lineNum, content: lines[lineNum - 1] })
			}
		} else if (/^\d+-\d+$/.test(segment)) {
			const [left, right] = segment.split('-').map(Number)
			const lo = Math.max(1, left)
			const hi = Math.min(lines.length, right)
			if (lo <= hi) {
				parts.push({ startLineNum: lo, content: lines.slice(lo - 1, hi).join('\n') })
			}
		} else {
			let startIndex = -1
			for (let i = 0; i < lines.length; i++) {
				const m = lines[i].match(startRe)
				if (m && m[1].trim() === segment) {
					startIndex = i
					break
				}
			}
			if (startIndex === -1) {
				return { ok: false, error: `region '${segment}' not found` }
			}
			let endIndex = -1
			for (let j = startIndex + 1; j < lines.length; j++) {
				if (endRe.test(lines[j])) {
					endIndex = j
					break
				}
			}
			if (endIndex === -1) {
				return { ok: false, error: `region '${segment}' has no matching #endregion` }
			}
			const body = lines.slice(startIndex + 1, endIndex)
			const content = [lines[startIndex], ...body].join('\n')
			parts.push({ startLineNum: startIndex + 1, content })
		}
	}

	if (parts.length === 0) {
		return { ok: true, content: '' }
	}

	let output = ''
	for (let i = 0; i < parts.length; i++) {
		const { startLineNum, content } = parts[i]
		const prefix = `... Line ${startLineNum}\n`
		if (i === 0) {
			output = startLineNum === 1 ? content : prefix + content
		} else {
			output += '\n' + prefix + content
		}
	}

	return { ok: true, content: output }
}
