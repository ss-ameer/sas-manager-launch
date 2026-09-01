const fs = require('fs');
let content = fs.readFileSync('src/components/LiveExecutionModal.tsx', 'utf8');

const replacement = `{(() => {
                        const dynamicOutcomes = callOutcomes?.length ? callOutcomes : OUTCOMES.map(o => ({ name: o, sentiment: POSITIVE_OUTCOMES.includes(o as any) ? 'positive' : NEUTRAL_OUTCOMES.includes(o as any) ? 'neutral' : 'negative' }));
                        const pos = dynamicOutcomes.filter(o => o.sentiment === 'positive');
                        const neu = dynamicOutcomes.filter(o => o.sentiment === 'neutral' || !o.sentiment);
                        const neg = dynamicOutcomes.filter(o => o.sentiment === 'negative');
                        
                        const allNames = dynamicOutcomes.map(o => o.name);
                        const legacyOption = callOutcome && !allNames.includes(callOutcome) ? callOutcome : null;

                        return (
                          <>
                            <optgroup label="🟢 POSITIVE / WINS">
                              {pos.map((o) => (
                                <option key={o.name} value={o.name}>
                                  {o.name}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="🟡 NEUTRAL / IN-PROGRESS">
                              {neu.map((o) => (
                                <option key={o.name} value={o.name}>
                                  {o.name}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="🔴 NEGATIVE / LOSSES">
                              {neg.map((o) => (
                                <option key={o.name} value={o.name}>
                                  {o.name}
                                </option>
                              ))}
                            </optgroup>
                            {legacyOption && (
                              <optgroup label="⚪ LEGACY OUTCOME">
                                <option value={legacyOption}>{legacyOption}</option>
                              </optgroup>
                            )}
                          </>
                        );
                      })()}`;

content = content.replace(
  /\{\(\(\) => \{\n\s*return \(\n\s*<>\n\s*<optgroup label="🟢 POSITIVE \/ WINS">[\s\S]*?<\/optgroup>\n\s*<\/>\n\s*\);\n\s*\}\)\(\)\}/g,
  replacement
);

fs.writeFileSync('src/components/LiveExecutionModal.tsx', content);
