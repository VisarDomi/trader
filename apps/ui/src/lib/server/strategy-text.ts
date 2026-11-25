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

/** Turns a Markdown section into native rows: titled cards for labeled list items, plain paragraphs otherwise. */
export function plainNativeBlocks(body: string): { title: string; body: string }[] {
	const out: { title: string; body: string }[] = [];
	let para: string[] = [];
	const flushPara = () => {
		const joined = stripMarkdownInline(para.join(' '));
		if (joined) out.push({ title: '', body: joined });
		para = [];
	};
	for (const rawLine of body.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) {
			flushPara();
			continue;
		}
		const item = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
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
		para.push(line);
	}
	flushPara();
	return out;
}
