import React from 'react';
import { 
  Globe, 
  ChevronDown, 
  AlertTriangle, 
  Image as ImageIcon,
  CheckCircle2,
  Circle,
  FileText
} from 'lucide-react';

export default function EditorialStudio() {
  return (
    <div className="h-screen flex overflow-hidden bg-[#FAF8F3] font-sans">
      
      {/* LEFT PANEL */}
      <div className="w-[260px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <h1 className="font-['Playfair_Display'] text-lg font-semibold text-[#1B2A4A]">
            WorldSmith
          </h1>
          <div className="text-xs text-gray-400 tracking-widest uppercase mt-0.5">
            Editorial
          </div>
          
          <button className="w-full flex items-center justify-between bg-[#FAF8F3] hover:bg-gray-100 transition-colors rounded px-2 py-1.5 mt-4 border border-gray-200/50 text-left">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Wychcombe</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        {/* Record Tree */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          
          {/* PRODUCTION SPECS */}
          <div>
            <div className="flex items-center gap-1.5 px-1 mb-2">
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Production Specs</span>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">15</span>
            </div>
            
            <div className="space-y-3">
              {/* Hero Papers */}
              <div className="space-y-0.5">
                <div className="text-xs text-gray-800 font-medium px-1 py-1 flex items-center gap-1.5">
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                  Hero Papers
                </div>
                <div className="pl-4 space-y-0.5">
                  <div className="text-[11px] text-gray-600 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer transition-colors">
                    V01·HP·001 The Hearth
                  </div>
                  <div className="text-[11px] text-gray-600 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer transition-colors">
                    V01·HP·002 The Armchair
                  </div>
                  <div className="text-[11px] text-gray-600 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer transition-colors">
                    V01·HP·003 The Window Seat
                  </div>
                  <div className="text-[11px] bg-[#C87560]/10 text-[#C87560] font-medium border-l-2 border-[#C87560] py-1.5 px-2 rounded-r cursor-pointer">
                    V01·HP·004 The Library Table
                  </div>
                </div>
              </div>

              {/* Decorative Papers */}
              <div className="space-y-0.5">
                <div className="text-xs text-gray-600 font-medium px-1 py-1 flex items-center gap-1.5 cursor-pointer hover:text-gray-900 transition-colors">
                  <ChevronDown className="w-3 h-3 text-gray-300 -rotate-90" />
                  Decorative Papers
                </div>
                <div className="pl-6">
                  <span className="text-[11px] text-gray-400">6 records</span>
                </div>
              </div>

              {/* Journal Cards */}
              <div className="space-y-0.5">
                <div className="text-xs text-gray-600 font-medium px-1 py-1 flex items-center gap-1.5 cursor-pointer hover:text-gray-900 transition-colors">
                  <ChevronDown className="w-3 h-3 text-gray-300 -rotate-90" />
                  Journal Cards
                </div>
                <div className="pl-6">
                  <span className="text-[11px] text-gray-400">5 records</span>
                </div>
              </div>
            </div>
          </div>

          {/* CANON RECORDS */}
          <div>
            <div className="flex items-center gap-1.5 px-1 mb-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Canon Records</span>
            </div>
            <div className="px-1 text-[11px] text-gray-500">8 records</div>
          </div>

          {/* STYLE GUIDES */}
          <div>
            <div className="flex items-center gap-1.5 px-1 mb-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Style Guides</span>
            </div>
            <div className="px-1 text-[11px] text-gray-500">3 records</div>
          </div>

          {/* PROMPT MODULES */}
          <div>
            <div className="flex items-center gap-1.5 px-1 mb-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Prompt Modules</span>
            </div>
            <div className="px-1 text-[11px] text-gray-500">12 records</div>
          </div>

        </div>

        {/* Bottom Footer */}
        <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-2 bg-gray-50/50 mt-auto">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></div>
          <span className="text-xs text-gray-500">All synced · 2m ago</span>
        </div>
      </div>


      {/* CENTRE PANEL */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        
        <div className="flex-1 overflow-y-auto pb-24">
          {/* Spec Header */}
          <div className="bg-white px-8 pt-8 pb-6 border-b border-gray-200">
            <div className="text-xs text-gray-400 mb-2">
              Wychcombe / Summer 2025
            </div>
            <div className="text-xs text-[#C87560] uppercase tracking-widest font-semibold mb-2">
              V01 Hero Paper 004
            </div>
            <h2 className="font-['Playfair_Display'] text-3xl font-semibold text-[#1B2A4A] mb-4">
              The Library Table
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-[#C87560]/10 border border-[#C87560]/20 text-[#C87560] text-xs font-medium rounded-full px-3 py-1">
                Hero Paper
              </span>
              <span className="bg-gray-100 border border-gray-200 text-gray-600 text-xs font-medium rounded-full px-3 py-1">
                Wychcombe
              </span>
              <span className="bg-gray-100 border border-gray-200 text-gray-600 text-xs font-medium rounded-full px-3 py-1">
                Summer 2025
              </span>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="bg-white border-b border-gray-200 px-8 flex gap-8">
            <button className="text-sm py-4 border-b-2 border-[#C87560] text-[#C87560] font-medium transition-colors">
              Identity & Creative
            </button>
            <button className="text-sm py-4 border-b-2 border-transparent text-gray-500 hover:text-gray-800 transition-colors">
              Prompt Payload
            </button>
            <button className="text-sm py-4 border-b-2 border-transparent text-gray-500 hover:text-gray-800 transition-colors">
              Canon & Governance
            </button>
            <button className="text-sm py-4 border-b-2 border-transparent text-gray-500 hover:text-gray-800 transition-colors">
              History
            </button>
          </div>

          {/* Form Content */}
          <div className="px-8 py-8 space-y-10 max-w-3xl">
            
            {/* Creative Direction Section */}
            <section>
              <div className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-5 pb-3 border-b border-gray-200/60">
                Creative Direction
              </div>
              
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-800">Design Intent</label>
                  <p className="text-[13px] text-gray-500 mb-2">The emotional and aesthetic goal of this production item</p>
                  <textarea 
                    className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 shadow-sm focus:ring-2 focus:ring-[#C87560]/20 focus:border-[#C87560] transition-shadow resize-none h-24"
                    defaultValue="To evoke an intimate evening study, heavy with the atmosphere of accumulated knowledge — leather, candlelight, and the faint smell of aged paper."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-800">Narrative Purpose</label>
                  <p className="text-[13px] text-gray-500 mb-2">How this item serves the world-building narrative</p>
                  <textarea 
                    className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 shadow-sm focus:ring-2 focus:ring-[#C87560]/20 focus:border-[#C87560] transition-shadow resize-none h-20"
                    defaultValue="Establishes the Library as a central sanctuary within Wychcombe, grounding the collector in a specific, beloved room."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-800">Required Content</label>
                  <p className="text-[13px] text-gray-500 mb-2">Specific objects or elements that must appear</p>
                  <textarea 
                    className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 shadow-sm focus:ring-2 focus:ring-[#C87560]/20 focus:border-[#C87560] transition-shadow resize-none h-20"
                    defaultValue="Reading lamp (warm amber glow), stacked leather-bound volumes, scattered correspondence, ink well and quill"
                  />
                </div>
              </div>
            </section>

            {/* Visual Requirements Section */}
            <section>
              <div className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-5 pb-3 border-b border-gray-200/60">
                Visual Requirements
              </div>
              
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-800">Orientation</label>
                  <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 w-fit">
                    <button className="bg-[#1B2A4A] text-white rounded-md px-4 py-1.5 text-sm font-medium shadow-sm transition-colors">
                      Portrait
                    </button>
                    <button className="text-gray-600 rounded-md px-4 py-1.5 text-sm font-medium hover:text-gray-900 transition-colors">
                      Landscape
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-800">Writing Space</label>
                  <div className="flex items-center gap-3 pt-1">
                    <div className="w-10 h-6 bg-emerald-500 rounded-full p-1 cursor-pointer transition-colors">
                      <div className="w-4 h-4 bg-white rounded-full translate-x-4 shadow-sm transition-transform"></div>
                    </div>
                    <span className="text-sm text-gray-700 font-medium">Yes, include writing lines</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-800">Front Style</label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 shadow-sm focus:ring-2 focus:ring-[#C87560]/20 focus:border-[#C87560]">
                      <option>Scene-based · Full Bleed</option>
                      <option>Vignette · Floating</option>
                      <option>Pattern · Repeating</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-800">Component Type</label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 shadow-sm focus:ring-2 focus:ring-[#C87560]/20 focus:border-[#C87560]">
                      <option>Hero Paper</option>
                      <option>Decorative Paper</option>
                      <option>Journal Card</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

              </div>
            </section>

          </div>
        </div>

        {/* Bottom Action Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-8 py-4 flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
              <Circle className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
              85 / 100
            </div>
            <div className="bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-xs font-semibold px-2.5 py-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Canon Clear
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium transition-colors shadow-sm">
              Save Draft
            </button>
            <button className="bg-[#C87560] hover:bg-[#B36350] text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
              Publish to Notion <span className="text-lg leading-none mb-0.5">→</span>
            </button>
          </div>
        </div>

      </div>


      {/* RIGHT PANEL */}
      <div className="w-[280px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        
        <div className="px-4 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <h3 className="text-sm font-semibold text-gray-800">Relationships</h3>
        </div>

        <div className="flex-1 overflow-y-auto pb-6">
          <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5 shadow-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 font-medium leading-relaxed">
              1 canon record awaiting approval
            </div>
          </div>

          <div className="px-4 py-4 space-y-3">
            
            {/* Style Guide */}
            <div className="bg-[#FAF8F3] rounded-lg p-3 border border-gray-200/60 shadow-sm transition-shadow hover:shadow">
              <div className="text-[10px] uppercase text-gray-400 tracking-widest font-bold mb-1.5 flex items-center justify-between">
                Style Guide
                <FileText className="w-3 h-3 text-gray-300" />
              </div>
              <div className="text-[13px] font-semibold text-gray-800 mb-2">
                Wychcombe Library Style
              </div>
              <div className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                Linked ✓
              </div>
            </div>

            {/* Component Spec */}
            <div className="bg-[#FAF8F3] rounded-lg p-3 border border-gray-200/60 shadow-sm transition-shadow hover:shadow">
              <div className="text-[10px] uppercase text-gray-400 tracking-widest font-bold mb-1.5 flex items-center justify-between">
                Component Spec
                <FileText className="w-3 h-3 text-gray-300" />
              </div>
              <div className="text-[13px] font-semibold text-gray-800 mb-2">
                Hero Paper Standard
              </div>
              <div className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                Linked ✓
              </div>
            </div>

            {/* Canon Records */}
            <div className="bg-[#FAF8F3] rounded-lg p-3 border border-gray-200/60 shadow-sm transition-shadow hover:shadow">
              <div className="text-[10px] uppercase text-gray-400 tracking-widest font-bold mb-2 flex items-center justify-between">
                Canon Records
                <span className="bg-white border border-gray-200 text-gray-500 rounded px-1.5 py-0.5 text-[9px]">2 items</span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-[13px] font-semibold text-gray-800 mb-1.5">The Library Athenaeum</div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                    Accepted ✓
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-200/50">
                  <div className="text-[13px] font-semibold text-gray-800 mb-1.5">The Evening Lamp</div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                    Under Review
                  </div>
                </div>
              </div>
            </div>

            {/* Prompt Modules */}
            <div className="bg-[#FAF8F3] rounded-lg p-3 border border-gray-200/60 shadow-sm transition-shadow hover:shadow">
              <div className="text-[10px] uppercase text-gray-400 tracking-widest font-bold mb-2 flex items-center justify-between">
                Prompt Modules
                <span className="bg-white border border-gray-200 text-gray-500 rounded px-1.5 py-0.5 text-[9px]">3 items</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-gray-700">Wychcombe Atmosphere</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-gray-700">Foundation Standard</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-gray-700">Material Authenticity</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                </div>
              </div>
            </div>

            {/* Visual Asset */}
            <div className="bg-[#FAF8F3] rounded-lg p-3 border border-gray-200/60 shadow-sm transition-shadow hover:shadow">
              <div className="text-[10px] uppercase text-gray-400 tracking-widest font-bold mb-2">
                Visual Asset
              </div>
              <div className="bg-gray-50/80 border border-gray-200/50 border-dashed rounded-lg p-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                  <ImageIcon className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-xs font-medium text-gray-500">Not yet compiled</div>
                <div className="text-[10px] text-gray-400 mt-1">Run compile to generate</div>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}