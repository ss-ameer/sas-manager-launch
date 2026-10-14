const fs = require('fs');

const file = 'src/components/quotations/QuotationDocument.tsx';
const content = fs.readFileSync(file, 'utf8');

const startMarker = `{/* ========================================================\n            HEADER & META BLOCK (VARIANTS: split, centered_banner, modern_compact)\n           ======================================================== */}`;
const endMarker = `{/* ========================================================\n            ITEMIZED TABLE (ENTERPRISE 6-COLUMN STANDARD - SELECTABLE STRUCTURAL SECTION)\n           ======================================================== */}`;

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Markers not found! startIndex:', startIndex, 'endIndex:', endIndex);
  process.exit(1);
}

const replacement = `{/* ========================================================
            1. HEADER & COMPANY BRANDING (STRUCTURAL SECTION)
           ======================================================== */}
        {(() => {
          const headerAlign = resolvedHeaderConfig.alignment || (headerLayout === 'centered_banner' ? 'centered' : 'split');
          const logoHeight = resolvedHeaderConfig.logoHeightPx || 44;

          return (
            <header
              className={\`border-b border-slate-200 pb-4 mb-4 w-full header-flex-container relative group transition-all duration-150 rounded-lg quotation-structural-section \${
                isInteractive ? 'cursor-pointer' : ''
              } \${
                isHeaderSelected
                  ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0 print:outline-none !print:outline-none print:shadow-none !print:shadow-none'
                  : isInteractive
                  ? 'hover:ring-1 hover:ring-blue-300 print:ring-0 !print:ring-0 print:outline-none !print:outline-none'
                  : ''
              }\`}
              onClick={isInteractive ? (e) => {
                e.stopPropagation();
                if (onSelectSection) onSelectSection('header');
                else if (onSelectBlock) onSelectBlock('header' as any);
              } : undefined}
              style={{ width: '100%', maxWidth: '100%' }}
            >
              {isInteractive && (
                <div className={\`absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 \${
                  isHeaderSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
                }\`}>
                  {isHeaderSelected ? 'Editing Header & Branding' : 'Click to Inspect Header'}
                </div>
              )}

              {headerAlign === 'centered' ? (
                /* Centered Stack Branding */
                <div className="flex flex-col items-center text-center space-y-1.5 w-full" style={{ width: '100%', maxWidth: '100%' }}>
                  <div className="pb-1">
                    {profile?.logo_url && !logoLoadFailed ? (
                      <img
                        src={profile.logo_url}
                        alt={senderEntityName}
                        style={{ height: \`\${logoHeight}px\`, maxHeight: '64px' }}
                        className="max-w-[240px] object-contain"
                        onError={() => setLogoLoadFailed(true)}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm"
                        style={{ backgroundColor: accentColor }}
                      >
                        <Building2 className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                    {senderEntityName}
                  </h1>
                  {/* Centered Contact Strip with separator dots */}
                  {(() => {
                    const contactSegments: React.ReactNode[] = [];
                    if (senderAddress) {
                      contactSegments.push(
                        <span key="addr" className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{senderAddress}</span>
                        </span>
                      );
                    }
                    if (resolvedHeaderConfig.showPhone !== false && senderPhone) {
                      contactSegments.push(
                        <span key="phone" className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{senderPhone}</span>
                        </span>
                      );
                    }
                    if (resolvedHeaderConfig.showEmail !== false && senderEmail) {
                      contactSegments.push(
                        <span key="email" className="inline-flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{senderEmail}</span>
                        </span>
                      );
                    }
                    if (resolvedHeaderConfig.showWebsite !== false && senderWebsite) {
                      contactSegments.push(
                        <span key="web" className="inline-flex items-center gap-1">
                          <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{senderWebsite}</span>
                        </span>
                      );
                    }
                    if (resolvedHeaderConfig.showTrn !== false && senderTrn) {
                      contactSegments.push(
                        <span key="trn" className="inline-flex items-center gap-1">
                          <span className="text-slate-400 font-medium">TRN:</span>
                          <span className="font-mono font-semibold text-slate-700">{senderTrn}</span>
                        </span>
                      );
                    }

                    if (contactSegments.length === 0) return null;
                    return (
                      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-600 pt-1">
                        {contactSegments.map((segment, idx) => (
                          <span key={idx} className="inline-flex items-center gap-2 whitespace-nowrap">
                            <span>{segment}</span>
                            {idx < contactSegments.length - 1 && (
                              <span className="text-slate-300 font-bold select-none shrink-0" aria-hidden="true">•</span>
                            )}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                /* Split Layout: Logo & Entity on Left, Address & Contacts on Right */
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 w-full" style={{ width: '100%', maxWidth: '100%' }}>
                  <div className="flex items-center gap-3">
                    {profile?.logo_url && !logoLoadFailed ? (
                      <img
                        src={profile.logo_url}
                        alt={senderEntityName}
                        style={{ height: \`\${logoHeight}px\`, maxHeight: '64px' }}
                        className="max-w-[200px] object-contain"
                        onError={() => setLogoLoadFailed(true)}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm"
                        style={{ backgroundColor: accentColor }}
                      >
                        <Building2 className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                        {senderEntityName}
                      </h1>
                      {resolvedHeaderConfig.showTrn !== false && senderTrn && (
                        <p className="text-xs font-semibold text-slate-600 mt-0.5">
                          TRN / VAT Reg: <span className="text-slate-900 font-mono">{senderTrn}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Contact & Address details */}
                  <div className="text-xs text-slate-600 space-y-0.5 sm:text-right pt-0.5">
                    {senderAddress && (
                      <p className="flex items-center sm:justify-end gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{senderAddress}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap sm:justify-end gap-x-3 gap-y-0.5 text-slate-600">
                      {resolvedHeaderConfig.showPhone !== false && senderPhone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{senderPhone}</span>
                        </span>
                      )}
                      {resolvedHeaderConfig.showEmail !== false && senderEmail && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{senderEmail}</span>
                        </span>
                      )}
                      {resolvedHeaderConfig.showWebsite !== false && senderWebsite && (
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3 text-slate-400" />
                          <span>{senderWebsite}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </header>
          );
        })()}

        {/* ========================================================
            2. CLIENT & OFFER METADATA CARD (STRUCTURAL SECTION)
           ======================================================== */}
        {(() => {
          const isFramed = resolvedRecipientConfig.style !== 'minimal';
          const isSplit = resolvedRecipientConfig.layout !== 'stacked';
          const cardClass = isFramed
            ? 'border border-slate-200 bg-slate-50/70 rounded-xl p-3.5'
            : 'border-b border-slate-200 bg-transparent rounded-none p-2';

          return (
            <section
              className={\`mb-4 w-full relative group transition-all duration-150 rounded-xl quotation-structural-section \${
                isInteractive ? 'cursor-pointer' : ''
              } \${
                isRecipientSelected
                  ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0 print:outline-none !print:outline-none print:shadow-none !print:shadow-none'
                  : isInteractive
                  ? 'hover:ring-1 hover:ring-blue-300 print:ring-0 !print:ring-0 print:outline-none !print:outline-none'
                  : ''
              }\`}
              onClick={isInteractive ? (e) => {
                e.stopPropagation();
                if (onSelectSection) onSelectSection('recipient_meta');
                else if (onSelectBlock) onSelectBlock('recipient_meta' as any);
              } : undefined}
              style={{ width: '100%', maxWidth: '100%' }}
            >
              {isInteractive && (
                <div className={\`absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 \${
                  isRecipientSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
                }\`}>
                  {isRecipientSelected ? 'Editing Client & Offer Meta' : 'Click to Inspect Metadata'}
                </div>
              )}

              <div className={isSplit ? 'grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch w-full' : 'space-y-3 w-full'}>
                {/* Left Sub-Card: Submitted To / Client Snapshot */}
                <div className={\`\${cardClass} flex flex-col justify-between w-full\`}>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mb-1.5 flex items-center justify-between">
                      <span>Submitted To / Attention</span>
                      {resolvedRecipientConfig.showEnquiryRef !== false && (enquiry?.reference_id || quotation.enquiry_id) && (
                        <span className="font-mono text-slate-400 font-normal lowercase">
                          rfq: {enquiry?.reference_id || quotation.enquiry_id}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {quotation.client_snapshot?.entity_name || 'Client Name / Unspecified'}
                    </h3>
                    {resolvedRecipientConfig.showAttention !== false && quotation.client_snapshot?.contact_person && (
                      <p className="text-xs text-slate-700 font-medium mt-0.5">
                        Attn:{' '}
                        <span className="text-slate-900 font-semibold">
                          {quotation.client_snapshot.contact_person}
                        </span>
                      </p>
                    )}
                    {quotation.client_snapshot?.address && (
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {quotation.client_snapshot.address}
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 space-y-0.5 pt-2 mt-2 border-t border-slate-200/60">
                    {quotation.client_snapshot?.email && (
                      <p><span className="text-slate-400">Email:</span> {quotation.client_snapshot.email}</p>
                    )}
                    {quotation.client_snapshot?.phone && (
                      <p><span className="text-slate-400">Tel:</span> {quotation.client_snapshot.phone}</p>
                    )}
                    {quotation.client_snapshot?.trn && (
                      <p><span className="text-slate-400">Client TRN:</span> <span className="font-mono">{quotation.client_snapshot.trn}</span></p>
                    )}
                  </div>
                </div>

                {/* Right Sub-Card: Commercial Offer & Meta Identity */}
                <div className={\`\${cardClass} flex flex-col justify-between w-full\`}>
                  <div>
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
                      <span className="text-xs uppercase font-extrabold tracking-wider text-slate-500">
                        Commercial Offer
                      </span>
                      <span
                        className="px-2 py-0.5 text-xs font-bold rounded-full text-white"
                        style={{ backgroundColor: accentColor }}
                      >
                        {\`R\${quotation.revision_number}\`}
                      </span>
                    </div>

                    <div className="py-2.5">
                      <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">Quote Reference</div>
                      <div className="text-base sm:text-lg font-mono font-bold text-slate-900">
                        {quotation.formatted_quote_ref || quotation.quote_number}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 space-y-1 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Date:
                      </span>
                      <span className="font-semibold text-slate-800">
                        {formatDate(quotation.created_at)}
                      </span>
                    </div>

                    {resolvedRecipientConfig.showValidity !== false && quotation.valid_until && (
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Valid Until:
                        </span>
                        <span className="font-semibold text-slate-800">
                          {formatDate(quotation.valid_until)}
                        </span>
                      </div>
                    )}

                    {resolvedRecipientConfig.showSalesRep !== false && (salesRepName || (quotation as any)?.salesperson_name || (quotation as any)?.assigned_to_name || enquiry?.sales_representative || enquiry?.salesperson) && (
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="text-slate-400">Account Rep:</span>
                        <span className="font-semibold text-slate-800">
                          {salesRepName || (quotation as any)?.salesperson_name || (quotation as any)?.assigned_to_name || enquiry?.sales_representative || enquiry?.salesperson}
                        </span>
                      </div>
                    )}

                    {quotation.status && (
                      <div className="flex justify-between items-center pt-0.5">
                        <span className="text-slate-400">Status:</span>
                        <span className="font-bold text-slate-700 uppercase tracking-wider text-[10.5px]">
                          {quotation.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          );
        })()}

        `;

const newContent = content.slice(0, startIndex) + replacement + content.slice(endIndex);
fs.writeFileSync(file, newContent, 'utf8');
console.log('Successfully replaced header and recipient meta sections in QuotationDocument.tsx!');
