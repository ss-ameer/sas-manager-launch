const fs = require('fs');

let content = fs.readFileSync('src/components/EnquiryDetail.tsx', 'utf8');

content = content.replace(
  `                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-150 rounded-lg text-slate-500 hover:text-slate-800 transition flex items-center justify-center shadow-sm"
                        title="Download Proposal Document"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>`,
  `                      {file.url && (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-150 rounded-lg text-slate-500 hover:text-slate-800 transition flex items-center justify-center shadow-sm"
                          title="Download Proposal Document"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}`
);

fs.writeFileSync('src/components/EnquiryDetail.tsx', content);
