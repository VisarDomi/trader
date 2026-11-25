export interface NativeBlock {
	title: string;
	body: string;
	code?: boolean;
}

/** Plain-text Markdown/LaTeX cleanup for UIKit labels on iPhone (no raw **, backticks, or $...$). */
export function stripMarkdownInline(text: string): string {
	return text
		.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
		.replace(/\*\*([\s\S]+?)\*\*/g, '$1')
		.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1$2')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\$\\le\b/g, '≤')
		.replace(/\$\\ge\b/g, '≥')
		.replace(/\\sigma/g, 'σ')
		.replace(/\$([^$]+)\$/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Turns a Markdown section into native rows: titled cards for labeled list items, monospace blocks for equations, plain paragraphs otherwise. */
export function plainNativeBlocks(body: string): NativeBlock[] {
	const out: NativeBlock[] = [];
	let para: string[] = [];
	let inCode = false;
	let codeLines: string[] = [];
	let codeLabel = '';
	const flushPara = () => {
		const joined = stripMarkdownInline(para.join(' '));
		if (joined) out.push({ title: '', body: joined });
		para = [];
	};
	for (const rawLine of body.split(/\r?\n/)) {
		const trimmed = rawLine.trim();
		if (trimmed.startsWith('```')) {
			if (inCode) {
				const eq = codeLines.join('\n').trim();
				if (eq) {
					const prev = out.at(-1);
					if (!codeLabel && prev && !prev.title && !prev.code && prev.body.endsWith(':') && prev.body.length <= 80) {
						out.pop();
						out.push({ title: prev.body.slice(0, -1), body: eq, code: true });
					} else {
						out.push({ title: codeLabel, body: eq, code: true });
					}
				}
				codeLines = [];
				codeLabel = '';
				inCode = false;
			} else {
				flushPara();
				codeLabel = trimmed.slice(3).trim();
				inCode = true;
			}
			continue;
		}
		if (inCode) {
			codeLines.push(rawLine.trimEnd());
			continue;
		}
		if (!trimmed) {
			flushPara();
			continue;
		}
		const item = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(trimmed);
		if (item) {
			flushPara();
			const content = item[1]!;
			const labeled = /^\*\*([\s\S]+?)(?::|\.)?\*\*(?:\s*[:—–-]\s*|\s+)(.+)$/.exec(content);
			if (labeled) {
				out.push({ title: stripMarkdownInline(labeled[1]!.replace(/:$/, '')), body: stripMarkdownInline(labeled[2]!) });
			} else {
				out.push({ title: '', body: '• ' + stripMarkdownInline(content) });
			}
			continue;
		}
		para.push(trimmed);
	}
	if (inCode && codeLines.length) {
		const eq = codeLines.join('\n').trim();
		if (eq) out.push({ title: codeLabel, body: eq, code: true });
	}
	flushPara();
	return out;
}
