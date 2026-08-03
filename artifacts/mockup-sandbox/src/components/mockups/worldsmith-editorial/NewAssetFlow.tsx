import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Clock, 
  ChevronDown, 
  ChevronRight, 
  ChevronUp, 
  Search, 
  FileText, 
  Info, 
  X, 
  Circle 
} from 'lucide-react';

export default function NewAssetFlow() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#FAF8F3] font-sans">
      {/* TOP HEADER BAR */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex flex-col">
          <div className="flex items-center text-sm text-gray-400">
            <span>Wychcombe</span>
            <ChevronRight className="w-3.5 h-3.5 mx-1" />
            <span>Summer 2025</span>
            <ChevronRight className="w-3.5 h-3.5 mx-1" />
            <span className="text-gray-600">New Production Spec</span>
          </div>
          <div className="mt-1 flex items-center">
            <span className="bg-amber-50 text-amber-600 border border-amber-200 rounded-full text-xs px-2.5 py-0.5 font-medium">
              Draft &middot; Unsaved
            </span>
          </div>
        </div>
        <div className="flex items-center">
          <button className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg px-4 py-2 text-sm transition-colors">
            Save Draft
          </button>
          <button 
            className="bg-[#C87560] text-white rounded-lg px-5 py-2 text-sm font-medium ml-2 opacity-50 cursor-not-allowed"
            disabled
          >
            Continue &rarr;
          </button>
        </div>
      </header>

      {/* MAIN BODY */}
      <div className="flex-1 overflow-hidden flex gap-0">
        
        {/* LEFT COLUMN */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          
          {/* SECTION 1: Identity — COMPLETED */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="flex items-center">
                <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                <span className="text-sm font-semibold text-gray-800 ml-2">Identity</span>
              </div>
              <div className="flex items-center">
                <span className="text-xs font-medium text-emerald-600">4 / 4 complete</span>
                <ChevronUp className="w-4 h-4 text-gray-400 ml-2" />
              </div>
            </div>
            
            <div className="px-5 pb-4 grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg px-3 py-2 flex flex-col justify-center">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">World</span>
                <span className="text-sm font-medium text-gray-800">Wychcombe</span>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 flex flex-col justify-center">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Collection</span>
                <span className="text-sm font-medium text-gray-800">Summer 2025</span>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 flex flex-col justify-center">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Component Type</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">Hero Paper</span>
                  <span className="bg-rose-100 text-rose-700 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold">Paper</span>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 flex flex-col justify-center">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Production Item</span>
                <span className="text-lg font-['Playfair_Display'] text-gray-800 italic mt-0.5">The Conservatory Window</span>
              </div>
            </div>
          </div>

          {/* SECTION 2: Canon & Governance — ACTIVE / EXPANDED */}
          <div className="bg-white rounded-xl border-2 border-[#C87560] overflow-hidden shadow-sm">
            <div className="px-5 py-4 flex items-center justify-between bg-[#C87560]/5">
              <div className="flex items-center">
                <div className="bg-[#C87560] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-sm">
                  2
                </div>
                <span className="text-sm font-semibold text-gray-800 ml-2">Canon & Governance</span>
              </div>
              <span className="text-xs font-medium text-amber-600">1 / 3 required</span>
            </div>
            
            <div className="px-5 pb-5 pt-4 space-y-6">
              
              {/* Canon Dependency Field */}
              <div>
                <div className="flex items-center mb-1">
                  <label className="text-sm font-medium text-gray-700">Canon Dependency</label>
                  <span className="text-[10px] font-medium text-red-400 ml-1 mt-0.5">*</span>
                </div>
                <p className="text-xs text-gray-400 mb-3">How does this asset relate to established canon?</p>
                
                <div className="grid grid-cols-2 gap-2">
                  <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-2 text-sm hover:border-gray-300 hover:bg-gray-50 transition-colors text-left font-medium">
                    None
                  </button>
                  <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-2 text-sm hover:border-gray-300 hover:bg-gray-50 transition-colors text-left font-medium">
                    Supports Canon
                  </button>
                  <button className="bg-[#1B2A4A] border border-[#1B2A4A] text-white rounded-lg px-3 py-2 text-sm shadow-inner text-left font-medium flex items-center justify-between">
                    <span>Canon Reference</span>
                    <CheckCircle2 className="w-4 h-4 text-white opacity-80" />
                  </button>
                  <button className="bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-2 text-sm hover:border-gray-300 hover:bg-gray-50 transition-colors text-left font-medium">
                    Canon Defining
                  </button>
                </div>
                
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-3 flex gap-2.5">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800 leading-relaxed">
                    Canon Reference requires at least one <strong>Accepted</strong> canon record to be linked before this spec can compile.
                  </p>
                </div>
              </div>

              {/* Canon Records Field */}
              <div>
                <div className="flex items-center mb-1">
                  <label className="text-sm font-medium text-gray-700">Canon Records</label>
                  <span className="text-[10px] font-medium text-red-400 ml-1 mt-0.5">*</span>
                </div>
                <p className="text-xs text-gray-400 mb-3">Search and link canon records from Wychcombe</p>
                
                <div className="relative">
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Search canon records..." 
                      className="bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm w-full focus:outline-none focus:border-[#C87560] focus:ring-1 focus:ring-[#C87560]"
                      defaultValue="The Con"
                    />
                  </div>

                  {/* Dropdown suggestions */}
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 z-10 overflow-hidden">
                    <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                      <button className="w-full text-left hover:bg-gray-50 px-3 py-2.5 flex items-center justify-between transition-colors">
                        <span className="text-sm font-medium text-gray-800">The Conservatory Collection</span>
                        <span className="bg-emerald-100 text-emerald-700 rounded-full text-[10px] px-2 py-0.5 font-medium">Accepted</span>
                      </button>
                      <button className="w-full text-left hover:bg-gray-50 px-3 py-2.5 flex items-center justify-between transition-colors">
                        <span className="text-sm font-medium text-gray-800">The Hidden Garden</span>
                        <span className="bg-emerald-100 text-emerald-700 rounded-full text-[10px] px-2 py-0.5 font-medium">Accepted</span>
                      </button>
                      <button className="w-full text-left hover:bg-gray-50 px-3 py-2.5 flex items-center justify-between transition-colors">
                        <span className="text-sm font-medium text-gray-400">The Lamp Studies</span>
                        <span className="bg-amber-100 text-amber-700 rounded-full text-[10px] px-2 py-0.5 font-medium opacity-75">Under Review</span>
                      </button>
                    </div>
                    <div className="bg-gray-50 border-t border-gray-100 px-3 py-2">
                      <button className="text-xs font-medium text-[#C87560] hover:text-[#b06350] flex items-center">
                        + Create new canon record
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-900 ml-2">The Evening Study</span>
                    </div>
                    <div className="flex items-center">
                      <span className="bg-amber-200 text-amber-800 rounded-full text-[10px] px-2 py-0.5 font-medium">Under Review</span>
                      <button className="ml-3 text-amber-400 hover:text-amber-600 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 items-start px-1 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 leading-snug">
                      This record is Under Review. This spec will compile but will be flagged 'Requires Canon Review' until it's Accepted.
                    </p>
                  </div>
                </div>
              </div>

              {/* Readiness Gate */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 mt-2">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  Before this spec can compile, the following must be true:
                </p>
                <ul className="space-y-1.5">
                  <li className="flex items-center text-xs text-gray-600">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mr-2 shrink-0" />
                    Canon dependency type set
                  </li>
                  <li className="flex items-center text-xs text-gray-800 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mr-2 shrink-0" />
                    At least one Accepted canon record linked (currently 0 accepted)
                  </li>
                  <li className="flex items-center text-xs text-gray-500">
                    <Circle className="w-3.5 h-3.5 text-gray-300 mr-2 shrink-0" />
                    Payload Version set — unlocked in next section
                  </li>
                </ul>
              </div>

            </div>
          </div>

          {/* SECTION 3: Creative Direction — LOCKED */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden opacity-60">
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center">
                <Lock className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-500 ml-2">Creative Direction</span>
              </div>
              <span className="text-xs text-gray-400 italic">Unlocks after Canon is set</span>
            </div>
            <div className="px-5 pb-4">
              <p className="text-xs text-gray-400">
                Fill in 5 creative fields: Design Intent, Narrative Purpose, Required Content, Writing Space, Orientation.
              </p>
            </div>
          </div>

          {/* SECTION 4: Prompt Payload — LOCKED */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden opacity-60">
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center">
                <Lock className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-500 ml-2">Prompt Payload</span>
              </div>
              <span className="text-xs text-gray-400 italic">Unlocks after Creative Direction</span>
            </div>
            <div className="px-5 pb-4">
              <p className="text-xs text-gray-400">
                PP-2.0 sections: Shared Prompt, Front Prompt, Negative Prompt
              </p>
            </div>
          </div>

          {/* SECTION 5: Visual Requirements — LOCKED */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden opacity-60">
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center">
                <Lock className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-500 ml-2">Visual Requirements</span>
              </div>
              <span className="text-xs text-gray-400 italic">Unlocks after Prompt Payload</span>
            </div>
            <div className="px-5 pb-4">
              <p className="text-xs text-gray-400">
                3 fields: Front Style, Orientation, Component Set
              </p>
            </div>
          </div>

          <div className="h-8"></div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="w-[320px] shrink-0 border-l border-gray-200 bg-white overflow-y-auto flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)]">
          
          {/* COMPLETION HEADER */}
          <div className="px-6 py-6 border-b border-gray-100 flex flex-col items-center">
            <h3 className="text-sm font-semibold text-gray-800 self-start w-full mb-4">Completion</h3>
            
            <div className="relative w-[80px] h-[80px] flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                <circle 
                  cx="40" 
                  cy="40" 
                  r="34" 
                  stroke="#F3F4F6" 
                  strokeWidth="6" 
                  fill="none" 
                />
                <circle 
                  cx="40" 
                  cy="40" 
                  r="34" 
                  stroke="#C87560" 
                  strokeWidth="6" 
                  fill="none" 
                  strokeDasharray="213.6" 
                  strokeDashoffset="156" 
                  strokeLinecap="round"
                />
              </svg>
              <div className="flex flex-col items-center justify-center z-10">
                <span className="text-xl font-bold text-gray-800 leading-none">27%</span>
                <span className="text-[9px] font-medium uppercase tracking-widest text-gray-400 mt-1">Complete</span>
              </div>
            </div>
            
            <p className="text-xs text-gray-500 mt-4 text-center">
              3 of 11 required fields complete
            </p>
          </div>

          {/* SECTION BREAKDOWN */}
          <div className="px-6 py-5 border-b border-gray-100 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mr-2.5" />
                <span className="text-sm font-medium text-gray-700">Identity</span>
              </div>
              <span className="text-xs font-medium text-emerald-600">4 / 4</span>
            </div>
            <div className="flex items-center justify-between bg-amber-50 -mx-2 px-2 py-1 rounded-md">
              <div className="flex items-center">
                <Clock className="w-4 h-4 text-amber-500 mr-2.5" />
                <span className="text-sm font-semibold text-amber-900">Canon & Governance</span>
              </div>
              <span className="text-xs font-medium text-amber-700">1 / 3</span>
            </div>
            <div className="flex items-center justify-between opacity-60">
              <div className="flex items-center">
                <Lock className="w-4 h-4 text-gray-400 mr-2.5" />
                <span className="text-sm font-medium text-gray-500">Creative Direction</span>
              </div>
              <span className="text-xs text-gray-400">0 / 5</span>
            </div>
            <div className="flex items-center justify-between opacity-60">
              <div className="flex items-center">
                <Lock className="w-4 h-4 text-gray-400 mr-2.5" />
                <span className="text-sm font-medium text-gray-500">Prompt Payload</span>
              </div>
              <span className="text-xs text-gray-400">0 / 3</span>
            </div>
            <div className="flex items-center justify-between opacity-60">
              <div className="flex items-center">
                <Lock className="w-4 h-4 text-gray-400 mr-2.5" />
                <span className="text-sm font-medium text-gray-500">Visual Requirements</span>
              </div>
              <span className="text-xs text-gray-400">0 / 3</span>
            </div>
          </div>

          {/* WHAT'S NEEDED NEXT */}
          <div className="px-6 py-5 border-b border-gray-100 flex-1">
            <h4 className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-4">What's Needed Next</h4>
            
            <div className="space-y-3">
              {/* Item 1 - Blocking */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0 mr-2" />
                  <div>
                    <h5 className="text-xs font-semibold text-amber-900 leading-tight">Link an Accepted canon record</h5>
                    <p className="text-[11px] text-amber-700 mt-1 leading-snug">
                      The Evening Study is Under Review. Add The Conservatory Collection or another Accepted record.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Item 2 - Future */}
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 opacity-60">
                <div className="flex items-center">
                  <Circle className="w-3.5 h-3.5 text-gray-300 shrink-0 mr-2" />
                  <div className="flex-1">
                    <h5 className="text-xs font-medium text-gray-700">Design Intent</h5>
                    <p className="text-[10px] text-gray-500 mt-0.5">Unlocks after Canon</p>
                  </div>
                </div>
              </div>
              
              {/* Item 3 - Future */}
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 opacity-60">
                <div className="flex items-center">
                  <Circle className="w-3.5 h-3.5 text-gray-300 shrink-0 mr-2" />
                  <div className="flex-1">
                    <h5 className="text-xs font-medium text-gray-700">Narrative Purpose</h5>
                    <p className="text-[10px] text-gray-500 mt-0.5">Unlocks after Canon</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* COMPILE FORECAST */}
          <div className="px-6 py-5 bg-gray-50/50 mt-auto">
            <h4 className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-3">Compile Forecast</h4>
            
            <div className="flex items-start mb-3">
              <X className="w-4 h-4 text-red-400 mt-0.5 shrink-0 mr-2" />
              <div>
                <span className="text-xs font-semibold text-gray-800">Cannot compile yet</span>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">Requires an Accepted canon record and 8 more fields.</p>
              </div>
            </div>
            
            <div className="h-px bg-gray-200 my-3 w-full"></div>
            <p className="text-xs text-gray-400 leading-snug">
              Once complete, this spec will be ready to compile in the WorldSmith Compiler.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
