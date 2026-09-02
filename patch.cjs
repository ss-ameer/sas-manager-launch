const fs = require('fs');
let code = fs.readFileSync('src/components/CallLogManager.tsx', 'utf8');

const replacementLog = `{log.channel === 'Email' || log.interaction_type === 'email' ? (
                          log.email_address ? (
                            <a
                              href={\`mailto:\${log.email_address}\`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center space-x-1 font-mono font-bold text-purple-700 dark:text-purple-300 hover:underline bg-purple-50 dark:bg-purple-950/80 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 text-[11px]"
                            >
                              <Mail className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                              <span>{log.email_address}</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center space-x-1 font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px]">
                               <Mail className="w-3 h-3 text-slate-400" />
                               <span>No email logged</span>
                            </span>
                          )
                        ) : log.channel === 'Message (WhatsApp/SMS)' || log.channel === 'WhatsApp' ? (
                          log.contact_phone ? (
                             <a
                              href={\`https://wa.me/\${log.contact_phone.replace(/\\D/g, '')}\`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center space-x-1 font-mono font-bold text-emerald-700 dark:text-emerald-300 hover:underline bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 text-[11px]"
                             >
                               <MessageSquare className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                               <span>{log.contact_phone}</span>
                             </a>
                          ) : (
                             <span className="inline-flex items-center space-x-1 font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px]">
                               <MessageSquare className="w-3 h-3 text-slate-400" />
                               <span>No phone logged</span>
                            </span>
                          )
                        ) : log.contact_phone ? (
                          <a
                            href={\`tel:\${log.contact_phone}\`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1 font-mono font-bold text-blue-700 dark:text-blue-300 hover:underline bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-[11px]"
                          >
                            <PhoneCall className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            <span>{log.contact_phone}</span>
                          </a>
                        ) : log.email_address ? (
                          <a
                            href={\`mailto:\${log.email_address}\`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1 font-mono font-bold text-purple-700 dark:text-purple-300 hover:underline bg-purple-50 dark:bg-purple-950/80 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 text-[11px]"
                          >
                            <Mail className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                            <span>{log.email_address}</span>
                          </a>
                        ) : null}`;

const targetLog = `{log.contact_phone ? (
                          <a
                            href={\`tel:\${log.contact_phone}\`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1 font-mono font-bold text-blue-700 dark:text-blue-300 hover:underline bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-[11px]"
                          >
                            <PhoneCall className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            <span>{log.contact_phone}</span>
                          </a>
                        ) : log.email_address ? (
                          <a
                            href={\`mailto:\${log.email_address}\`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1 font-mono font-bold text-purple-700 dark:text-purple-300 hover:underline bg-purple-50 dark:bg-purple-950/80 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 text-[11px]"
                          >
                            <Mail className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                            <span>{log.email_address}</span>
                          </a>
                        ) : null}`;

code = code.replace(targetLog, replacementLog);

const targetQueue = `{item.contact_phone ? (
                          <a
                            href={\`tel:\${item.contact_phone}\`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-blue-700 hover:underline bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200"
                          >
                            <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                            <span>{item.contact_phone}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-amber-600 italic font-medium">
                            No direct phone logged
                          </span>
                        )}`;

const replacementQueue = `{item.channel === 'Email' || item.interaction_type === 'email' ? (
                          item.email_address ? (
                            <a
                              href={\`mailto:\${item.email_address}\`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-purple-700 hover:underline bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200"
                            >
                              <Mail className="w-3.5 h-3.5 text-purple-600" />
                              <span>{item.email_address}</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center space-x-1.5 text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                               <Mail className="w-3 h-3 text-slate-400" />
                               <span>No email logged</span>
                            </span>
                          )
                        ) : item.channel === 'Message (WhatsApp/SMS)' || item.channel === 'WhatsApp' ? (
                          item.contact_phone ? (
                             <a
                              href={\`https://wa.me/\${item.contact_phone.replace(/\\D/g, '')}\`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-emerald-700 hover:underline bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200"
                             >
                               <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                               <span>{item.contact_phone}</span>
                             </a>
                          ) : (
                             <span className="inline-flex items-center space-x-1.5 text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                               <MessageSquare className="w-3 h-3 text-slate-400" />
                               <span>No phone logged</span>
                            </span>
                          )
                        ) : item.contact_phone ? (
                          <a
                            href={\`tel:\${item.contact_phone}\`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-blue-700 hover:underline bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200"
                          >
                            <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                            <span>{item.contact_phone}</span>
                          </a>
                        ) : item.email_address ? (
                          <a
                            href={\`mailto:\${item.email_address}\`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-purple-700 hover:underline bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200"
                          >
                            <Mail className="w-3.5 h-3.5 text-purple-600" />
                            <span>{item.email_address}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-amber-600 italic font-medium">
                            No contact info
                          </span>
                        )}`;

code = code.replace(targetQueue, replacementQueue);
fs.writeFileSync('src/components/CallLogManager.tsx', code);
