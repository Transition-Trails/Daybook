import React from 'react';
import { 
  Globe, 
  ChevronDown, 
  AlertTriangle, 
  Image as ImageIcon,
  CheckCircle2,
  Circle,
  FileText,
  BookOpen,
  Box,
  PenTool
} from 'lucide-react';

const rootNode = { 
  id: 'root', 
  label: 'The Library Table', 
  type: 'V01·HP·004', 
  cx: 240, 
  cy: 360, 
  status: 'neutral', 
  tooltip: "Central Production Spec" 
};

const depsNodes = [
  { id: 'style', label: 'Wychcombe Style', type: 'Style Guide', cx: 100, cy: 90, status: 'green', icon: BookOpen, tooltip: "Linked & Approved" },
  { id: 'comp', label: 'Hero Paper Std', type: 'Component', cx: 380, cy: 90, status: 'green', icon: Box, tooltip: "Linked & Approved" },
  
  { id: 'canon1', label: 'Library Athenaeum', type: 'Canon', cx: 80, cy: 220, status: 'green', icon: FileText, tooltip: "Accepted into Canon" },
  { id: 'prompt1', label: 'Wychcombe Atmos.', type: 'Prompt', cx: 400, cy: 220, status: 'green', icon: PenTool, tooltip: "Module Synced" },
  
  { id: 'canon2', label: 'The Evening Lamp', type: 'Canon', cx: 80, cy: 500, status: 'amber', icon: FileText, tooltip: "Under Review by Editorial" },
  { id: 'prompt2', label: 'Foundation Std.', type: 'Prompt', cx: 400, cy: 500, status: 'green', icon: PenTool, tooltip: "Module Synced" },
  
  { id: 'visual', label: 'Visual Asset', type: 'Asset', cx: 100, cy: 630, status: 'red', dashed: true, icon: ImageIcon, tooltip: "Not yet compiled\nRun compile to generate" },
  { id: 'prompt3', label: 'Material Auth.', type: 'Prompt', cx: 380, cy: 630, status: 'green', icon: PenTool, tooltip: "Module Synced" },
];

function Curve({ start, end, status, dashed }: { start: any, end: any, status: string, dashed?: boolean }) {
  const midX = (start.cx + end.cx) / 2;
  const path = `M ${start.cx} ${start.cy} C ${midX} ${start.cy}, ${midX} ${end.cy}, ${end.cx} ${end.cy}`;
  
  let stroke = "#e2e8f0";
  if (status === 'green') stroke = "#6ee7b7"; 
  if (status === 'amber') stroke = "#fcd34d"; 
  if (status === 'red') stroke = "#fda4af"; 

  return (
    <path 
      d={path}
      fill="none"
      stroke={stroke}
      strokeWidth="2.5"
      strokeDasharray={dashed ? "5 5" : "none"}
      className="transition-all duration-300"
    />
  );
}

export default function EditorialStudioGraph() {
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


      {/* RIGHT PANEL - GRAPH VIEW */}
      <div className="w-[480px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0 z-10 shadow-[-4px_0_24px_rgba(0,0,0,0.02)]">
        
        <div className="px-5 py-4 border-b border-gray-100 bg-white sticky top-0 z-20 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Dependency Graph</h3>
          <div className="flex items-center gap-3 text-[10px] font-medium text-gray-500 uppercase tracking-widest">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400"></div> Synced</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400"></div> Review</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-400"></div> Action</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/50 flex flex-col">
          <div className="relative w-full h-[720px] mx-auto flex-shrink-0">
            
            {/* SVG Connections */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              {depsNodes.map(node => (
                <Curve key={`line-${node.id}`} start={rootNode} end={node} status={node.status} dashed={node.dashed} />
              ))}
            </svg>
            
            {/* Central Node */}
            <div className="absolute z-10 group" style={{ left: rootNode.cx, top: rootNode.cy, transform: 'translate(-50%, -50%)' }}>
              <div className="flex flex-col items-center justify-center px-4 py-3 rounded-xl shadow-xl border border-[#1B2A4A] bg-[#1B2A4A] text-white w-44 transition-transform hover:scale-[1.02] cursor-help relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1 relative z-10">{rootNode.type}</span>
                <span className="text-[15px] font-['Playfair_Display'] font-semibold text-center leading-tight relative z-10">{rootNode.label}</span>
              </div>
              <div className="absolute z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-max max-w-[200px] bg-gray-900 text-white text-[10px] font-medium px-3 py-2 rounded shadow-xl top-full mt-3 left-1/2 -translate-x-1/2">
                {rootNode.tooltip}
                <div className="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent bottom-full border-b-4 border-b-gray-900"></div>
              </div>
            </div>

            {/* Dependency Nodes */}
            {depsNodes.map(node => {
              let borderClass = 'border-gray-200';
              let iconBgClass = 'bg-gray-100';
              let iconClass = 'text-gray-500';
              let textClass = 'text-gray-700';
              let shadowClass = 'shadow-sm';

              if (node.status === 'green') {
                borderClass = 'border-emerald-200/60';
                iconBgClass = 'bg-emerald-50';
                iconClass = 'text-emerald-500';
                shadowClass = 'shadow-[0_4px_12px_rgba(16,185,129,0.06)] hover:shadow-[0_6px_16px_rgba(16,185,129,0.12)]';
              } else if (node.status === 'amber') {
                borderClass = 'border-amber-300/60';
                iconBgClass = 'bg-amber-50';
                iconClass = 'text-amber-500';
                shadowClass = 'shadow-[0_4px_12px_rgba(245,158,11,0.06)] hover:shadow-[0_6px_16px_rgba(245,158,11,0.12)]';
              } else if (node.status === 'red') {
                borderClass = 'border-rose-300 border-dashed';
                iconBgClass = 'bg-rose-50';
                iconClass = 'text-rose-500';
                shadowClass = 'shadow-[0_4px_12px_rgba(244,63,94,0.06)] hover:shadow-[0_6px_16px_rgba(244,63,94,0.12)]';
              }

              const Icon = node.icon;
              const isTooltipTop = node.cy >= 360;

              return (
                <div key={node.id} className="absolute z-10 group" style={{ left: node.cx, top: node.cy, transform: 'translate(-50%, -50%)' }}>
                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-full bg-white cursor-help w-[170px] border ${borderClass} ${shadowClass} transition-all duration-300 hover:-translate-y-0.5`}>
                    <div className={`p-1.5 rounded-full flex-shrink-0 ${iconBgClass}`}>
                      <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 leading-none mb-1 truncate">{node.type}</span>
                      <span className={`text-[11px] font-semibold leading-none truncate ${textClass}`}>{node.label}</span>
                    </div>
                  </div>

                  <div className={`absolute z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-max max-w-[200px] bg-gray-900 text-white text-[10px] font-medium px-3 py-2 rounded shadow-xl left-1/2 -translate-x-1/2 ${
                    isTooltipTop ? 'bottom-full mb-3' : 'top-full mt-3'
                  }`}>
                    {node.tooltip.split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {line}
                        {i < node.tooltip.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                    <div className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent ${
                      isTooltipTop ? 'top-full border-t-4 border-t-gray-900' : 'bottom-full border-b-4 border-b-gray-900'
                    }`}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}