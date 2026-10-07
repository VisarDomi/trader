/**
 * Minimal markdown → HTML for the repo's own docs (journal): headings, bullet
 * lists, paragraphs, **bold**, `code` and [links](url). Input is escaped first.
 * Relative links resolve against `linkBase` (e.g. the file's folder on GitHub).
 */

function escape(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string, linkBase: string): string {
	return escape(s)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
			const url = /^https?:\/\//.test(href) ? href : `${linkBase}/${href}`;
			return `<a href="${url}" rel="noopener">${text}</a>`;
		});
}

export function markdown(src: string, linkBase = ''): string {
	const out: string[] = [];
	let list: string[] | null = null;
	let para: string[] = [];
	const flush = () => {
		if (para.length) out.push(`<p>${inline(para.join(' '), linkBase)}</p>`);
		para = [];
		if (list) out.push(`<ul>${list.map(li => `<li>${inline(li, linkBase)}</li>`).join('')}</ul>`);
		list = null;
	};
	for (const raw of src.split('\n')) {
		const line = raw.trimEnd();
		const heading = /^(#{1,4})\s+(.*)$/.exec(line);
		const item = /^\s*[-*]\s+(.*)$/.exec(line);
		if (heading) {
			flush();
			const level = Math.min(heading[1]!.length + 1, 4);
			out.push(`<h${level}>${inline(heading[2]!, linkBase)}</h${level}>`);
		} else if (item) {
			if (para.length) flush();
			(list ??= []).push(item[1]!);
		} else if (line === '') {
			flush();
		} else if (list && /^\s+/.test(raw)) {
			list[list.length - 1] += ` ${line.trim()}`;
		} else {
			if (list) flush();
			para.push(line);
		}
	}
	flush();
	return out.join('\n');
}
