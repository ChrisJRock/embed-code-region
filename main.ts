import { Plugin, MarkdownRenderer, TFile, MarkdownPostProcessorContext, MarkdownView, parseYaml, requestUrl} from 'obsidian';
import { EmbedCodeFileSettings, EmbedCodeFileSettingTab, DEFAULT_SETTINGS} from "./settings";
import { analyseSrcLines, buildLineEntries, extractRegions, LineEntry } from "./utils";

function wrapCodeLines(codeEl: HTMLElement, entries: LineEntry[]): void {
	const spans = entries.map(e => {
		const span = document.createElement('span')
		span.className = 'ecr-line'
		span.dataset.lineNum = 'gap' in e ? '...' : String(e.lineNum)
		return span
	})

	let line = 0
	for (const node of Array.from(codeEl.childNodes)) {
		if (line >= spans.length) break
		if (node.nodeType === Node.TEXT_NODE) {
			const parts = (node.textContent ?? '').split('\n')
			for (let i = 0; i < parts.length; i++) {
				if (i > 0 && ++line >= spans.length) break
				const isGap = spans[line].dataset.lineNum === '...'
				if (!isGap && parts[i]) spans[line].appendChild(document.createTextNode(parts[i]))
			}
		} else if (node.nodeType === Node.ELEMENT_NODE && spans[line].dataset.lineNum !== '...') {
			spans[line].appendChild(node.cloneNode(true))
		}
	}

	codeEl.innerHTML = ''
	spans.forEach(s => codeEl.appendChild(s))
}

export default class EmbedCodeFile extends Plugin {
	settings: EmbedCodeFileSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new EmbedCodeFileSettingTab(this.app, this));

		this.registerMarkdownPostProcessor((element, context) => {
			this.addTitle(element, context);
		});

		// live preview renderers
		const supportedLanguages = this.settings.includedLanguages.split(",")
		supportedLanguages.forEach(l => {
			console.log(`registering renderer for ${l}`)
			this.registerRenderer(l)
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async registerRenderer(lang: string) {
		this.registerMarkdownCodeBlockProcessor(`embed-${lang}`, async (meta, el, ctx) => {
			let fullSrc = ""

			let metaYaml: any
			try {
				metaYaml = parseYaml(meta)
			} catch(e) {
				await MarkdownRenderer.renderMarkdown("`ERROR: invalid embedding (invalid YAML)`", el, '', this)
				return
			}

			let srcPath = metaYaml.PATH
			if (!srcPath) {
				await MarkdownRenderer.renderMarkdown("`ERROR: invalid source path`", el, '', this)
				return
			}

			if (srcPath.startsWith("https://") || srcPath.startsWith("http://")) {
				try {
					let httpResp = await requestUrl({url: srcPath, method: "GET"})
					fullSrc = httpResp.text
				} catch(e) {
					const errMsg = `\`ERROR: could't fetch '${srcPath}'\``
					await MarkdownRenderer.renderMarkdown(errMsg, el, '', this)
					return
				}
			} else if (srcPath.startsWith("vault://")) {
				srcPath = srcPath.replace(/^(vault:\/\/)/,'');

				const tFile = app.vault.getAbstractFileByPath(srcPath)
				if (tFile instanceof TFile) {
					fullSrc = await app.vault.read(tFile)
				} else {
					const errMsg = `\`ERROR: could't read file '${srcPath}'\``
					await MarkdownRenderer.renderMarkdown(errMsg, el, '', this)
					return
				}
			} else {
				const errMsg = "`ERROR: invalid source path, use 'vault://...' or 'http[s]://...'`"
				await MarkdownRenderer.renderMarkdown(errMsg, el, '', this)
				return
			}

			// Build line entries
			let entries: LineEntry[]
			const regionName: string | undefined = metaYaml.REGION
			const srcLinesNumString: string | undefined = metaYaml.LINES

			if (regionName) {
				const result = extractRegions(fullSrc, regionName)
				if (!result.ok) {
					const errMsg = `\`ERROR: ${result.error} in '${srcPath}'\``
					await MarkdownRenderer.renderMarkdown(errMsg, el, '', this)
					return
				}
				entries = result.entries
			} else if (srcLinesNumString) {
				entries = buildLineEntries(fullSrc, analyseSrcLines(srcLinesNumString))
			} else {
				entries = fullSrc.split(/\r?\n/).map((text, i) => ({ lineNum: i + 1, text }))
			}

			// Code text: gaps render as '...'
			const codeText = entries.map(e => 'gap' in e ? '...' : e.text).join('\n')

			// Render with syntax highlighting, then inject per-line number spans
			const tempEl = document.createElement('div')
			await MarkdownRenderer.renderMarkdown('```' + lang + '\n' + codeText + '\n```', tempEl, '', this)
			const renderedPre = tempEl.querySelector('pre') as HTMLPreElement | null
			const renderedCode = renderedPre?.querySelector('code') as HTMLElement | null
			if (renderedCode) wrapCodeLines(renderedCode, entries)

			el.appendChild(renderedPre ?? tempEl)

			let title = metaYaml.TITLE
			if (!title) title = srcPath
			this.addTitleLivePreview(el, title)
		});
	}

	addTitleLivePreview(el: HTMLElement, title: string) {
		const codeElm = el.querySelector('pre > code')
		if (!codeElm) { return }
		const pre = codeElm.parentElement as HTMLPreElement;

		this.insertTitlePreElement(pre, title)
	}

	addTitle(el: HTMLElement, context: MarkdownPostProcessorContext) {
		// add some commecnt 
		let codeElm = el.querySelector('pre > code')
		if (!codeElm) {
			return
		}

		const pre = codeElm.parentElement as HTMLPreElement;

		const codeSection = context.getSectionInfo(pre)
		if (!codeSection) {
			return
		}

		const view = app.workspace.getActiveViewOfType(MarkdownView)
		if (!view) {
			return
		}

		const num = codeSection.lineStart
		const codeBlockFirstLine = view.editor.getLine(num)

		let matchTitle = codeBlockFirstLine.match(/TITLE:\s*"([^"]*)"/i)
		if (matchTitle == null) {
			return
		}

		const title = matchTitle[1]
		if (title == "") {
			return
		}

		this.insertTitlePreElement(pre, title)
	}

	insertTitlePreElement(pre: HTMLPreElement, title: string) {
		pre
		.querySelectorAll(".obsidian-embed-code-file")
		.forEach((x) => x.remove());

		let titleElement = document.createElement("pre");
		titleElement.appendText(title);
		titleElement.className = "obsidian-embed-code-file";
		titleElement.style.color = this.settings.titleFontColor;
		titleElement.style.backgroundColor = this.settings.titleBackgroundColor;
		pre.prepend(titleElement);
	}
}
