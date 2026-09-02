const fs = require('fs');
let code = fs.readFileSync('src/components/layout/PageHeader.tsx', 'utf8');

const oldStr = `        {/* Right Action Bar Column */}
        {(primaryAction || (secondaryActions && secondaryActions.length > 0) || children) && (
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap shrink-0">
            {secondaryActions?.map((act, index) => {
              const SecIcon = act.icon;
              const isGhost = act.variant === 'ghost';
              return (
                <button
                  key={index}
                  type="button"
                  onClick={act.onClick}
                  className={
                    isGhost
                      ? 'px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer flex items-center gap-1.5'
                      : 'px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 shadow-2xs rounded-xl transition cursor-pointer flex items-center gap-1.5'
                  }
                >
                  {SecIcon && <SecIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
                  <span>{act.label}</span>
                </button>
              );
            })}
            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2 border border-blue-500/20 active:scale-[0.98]"
              >
                {primaryAction.icon && <primaryAction.icon className="w-4 h-4" />}
                <span>{primaryAction.label}</span>
              </button>
            )}
            {children}
          </div>
        )}
      </div>
    </div>`;

const newStr = `        {/* Right Action Bar Column */}
        {(primaryAction || (secondaryActions && secondaryActions.length > 0) || children) && (
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 shrink-0">
            {secondaryActions?.map((act, index) => {
              const SecIcon = act.icon;
              const isGhost = act.variant === 'ghost';
              return (
                <button
                  key={index}
                  type="button"
                  onClick={act.onClick}
                  className={
                    isGhost
                      ? 'w-full md:w-auto px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5'
                      : 'w-full md:w-auto px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 shadow-2xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5'
                  }
                >
                  {SecIcon && <SecIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
                  <span>{act.label}</span>
                </button>
              );
            })}
            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="w-full md:w-auto px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2 border border-blue-500/20 active:scale-[0.98]"
              >
                {primaryAction.icon && <primaryAction.icon className="w-4 h-4" />}
                <span>{primaryAction.label}</span>
              </button>
            )}
            {children}
          </div>
        )}
      </div>
    </div>`;

code = code.replace(oldStr, newStr);
fs.writeFileSync('src/components/layout/PageHeader.tsx', code);
