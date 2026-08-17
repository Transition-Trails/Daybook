import React from "react";
import { Sparkles, MoreHorizontal, Plus, ChevronDown, ArrowRight, ArrowDown } from "lucide-react";

export default function TheStudio() {
  return (
    <div 
      className="flex flex-col min-h-screen w-full font-['Instrument_Sans',sans-serif] text-[#1B2A4A] overflow-hidden"
      style={{ backgroundColor: "#FDFAF7" }}
    >
      {/* TOP BAR */}
      <div 
        className="h-12 w-full flex items-center justify-between px-4 border-b shrink-0"
        style={{ backgroundColor: "#FDFAF7", borderColor: "#DDD4C4" }}
      >
        <div className="flex items-center gap-2 text-sm text-[#1B2A4A]/60">
          <span className="cursor-pointer hover:text-[#1B2A4A] transition-colors">Wychcombe</span>
          <span>/</span>
          <span className="font-medium text-[#1B2A4A]">The Glasshouse</span>
        </div>
        
        <div></div> {/* Center */}
        
        <div className="flex items-center gap-3">
          <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            Accepted
          </div>
          <button className="p-1 rounded hover:bg-black/5 transition-colors text-[#1B2A4A]/60 hover:text-[#1B2A4A]">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 h-[calc(100vh-48px)]">
        {/* LEFT RAIL */}
        <div 
          className="w-[220px] shrink-0 border-r flex flex-col h-full overflow-y-auto"
          style={{ backgroundColor: "#F4EFE8", borderColor: "#DDD4C4" }}
        >
          <div className="p-4 flex flex-col h-full">
            <div className="text-[10px] font-bold tracking-wider uppercase text-[#1B2A4A]/50 mb-4">
              Records · 14
            </div>
            
            <div className="space-y-6 flex-1">
              {/* Characters */}
              <div>
                <div className="text-xs font-medium text-[#1B2A4A]/40 mb-2 px-2">Characters</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-black/5 transition-colors text-sm text-[#1B2A4A]/80">
                    <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0"></div>
                    <span className="truncate">Lady Ashmore</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-black/5 transition-colors text-sm text-[#1B2A4A]/80">
                    <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0"></div>
                    <span className="truncate">The Groundskeeper</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-black/5 transition-colors text-sm text-[#1B2A4A]/80">
                    <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0"></div>
                    <span className="truncate">Silas Vance</span>
                  </div>
                </div>
              </div>

              {/* Locations */}
              <div>
                <div className="text-xs font-medium text-[#1B2A4A]/40 mb-2 px-2">Locations</div>
                <div className="space-y-1">
                  <div 
                    className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-sm font-medium text-[#1B2A4A]"
                    style={{ borderLeft: "3px solid #C87560", backgroundColor: "#EFE9E1" }}
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-[-1px]"></div>
                    <span className="truncate">The Glasshouse</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-black/5 transition-colors text-sm text-[#1B2A4A]/80">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                    <span className="truncate">The East Wing</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-black/5 transition-colors text-sm text-[#1B2A4A]/80">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                    <span className="truncate">The Black Lake</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-black/5 transition-colors text-sm text-[#1B2A4A]/80">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                    <span className="truncate">Ashmore Village</span>
                  </div>
                </div>
              </div>
            </div>

            <button className="flex items-center gap-2 text-sm text-[#1B2A4A]/60 hover:text-[#1B2A4A] mt-6 px-2 py-2 transition-colors">
              <Plus size={16} />
              <span>New Record</span>
            </button>
          </div>
        </div>

        {/* MAIN PANEL */}
        <div 
          className="flex-1 h-full overflow-y-auto"
          style={{ backgroundColor: "#FDFAF7" }}
        >
          <div className="max-w-3xl mx-auto p-[40px]">
            {/* Header section */}
            <div className="mb-10">
              <input 
                type="text" 
                defaultValue="The Glasshouse"
                className="w-full font-['Playfair_Display',serif] text-[38px] leading-tight text-[#1B2A4A] bg-transparent outline-none border-none placeholder:text-[#1B2A4A]/30 focus:ring-0 mb-4"
                placeholder="Name your record..."
              />
              
              <textarea 
                defaultValue="An overgrown Victorian glasshouse at the edge of the estate. Iron frames tangled with wisteria."
                className="w-full text-lg leading-relaxed text-[#1B2A4A]/80 bg-transparent outline-none border-none placeholder:text-[#1B2A4A]/30 resize-none overflow-hidden"
                placeholder="Describe this place, person, or thing in your own words..."
                rows={2}
                onInput={(e) => {
                  e.currentTarget.style.height = 'auto';
                  e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                }}
              />
            </div>

            <div 
              className="w-full h-px mb-10" 
              style={{ backgroundColor: "#DDD4C4" }}
            ></div>

            {/* AI Prompts section */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={20} style={{ color: "#C87560" }} />
                <h2 
                  className="font-['Playfair_Display',serif] text-[20px] font-medium"
                  style={{ color: "#C87560" }}
                >
                  Image Ideas
                </h2>
              </div>
              <p className="text-sm text-[#1B2A4A]/50 ml-7">
                Based on your world's atmosphere and this record
              </p>
            </div>

            <div className="space-y-4 ml-7 mb-8">
              {/* Card 1 */}
              <div 
                className="rounded-xl p-4 shadow-[0_2px_8px_rgba(27,42,74,0.04)] transition-all hover:shadow-[0_4px_12px_rgba(27,42,74,0.08)] flex flex-col gap-4"
                style={{ 
                  backgroundColor: "#EFE9E1", 
                  borderLeft: "2px solid #C87560"
                }}
              >
                <p className="font-['Playfair_Display',serif] italic text-[15px] leading-relaxed text-[#1B2A4A]">
                  "A crumbling Victorian glasshouse at dusk, iron frames tangled with wisteria, warm lantern light glowing through broken panes, fog drifting along stone floor, moody and atmospheric"
                </p>
                <div className="flex items-end justify-between mt-1">
                  <div className="text-[11px] text-[#1B2A4A]/50 font-medium tracking-wide">
                    inspired by The Glasshouse · Fog & Gaslight
                  </div>
                  <button 
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white shadow-sm transition-transform hover:-translate-y-px active:translate-y-0"
                    style={{ backgroundColor: "#C87560" }}
                  >
                    <span>Use this</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>

              {/* Card 2 */}
              <div 
                className="rounded-xl p-4 shadow-[0_2px_8px_rgba(27,42,74,0.04)] transition-all hover:shadow-[0_4px_12px_rgba(27,42,74,0.08)] flex flex-col gap-4"
                style={{ 
                  backgroundColor: "#EFE9E1", 
                  borderLeft: "2px solid #C87560"
                }}
              >
                <p className="font-['Playfair_Display',serif] italic text-[15px] leading-relaxed text-[#1B2A4A]">
                  "Interior of an abandoned conservatory, overgrown with ferns and moss, shafts of pale light through ironwork ceiling, dust motes, Pre-Raphaelite oil painting style"
                </p>
                <div className="flex items-end justify-between mt-1">
                  <div className="text-[11px] text-[#1B2A4A]/50 font-medium tracking-wide">
                    inspired by The Glasshouse · Quiet Dread
                  </div>
                  <button 
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white shadow-sm transition-transform hover:-translate-y-px active:translate-y-0"
                    style={{ backgroundColor: "#C87560" }}
                  >
                    <span>Use this</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>

              {/* Card 3 */}
              <div 
                className="rounded-xl p-4 shadow-[0_2px_8px_rgba(27,42,74,0.04)] transition-all hover:shadow-[0_4px_12px_rgba(27,42,74,0.08)] flex flex-col gap-4"
                style={{ 
                  backgroundColor: "#EFE9E1", 
                  borderLeft: "2px solid #C87560"
                }}
              >
                <p className="font-['Playfair_Display',serif] italic text-[15px] leading-relaxed text-[#1B2A4A]">
                  "Lady Ashmore standing in the glasshouse doorway at night, silhouetted against gaslight, looking into fog-covered gardens, Gothic Victorian illustration"
                </p>
                <div className="flex items-end justify-between mt-1">
                  <div className="text-[11px] text-[#1B2A4A]/50 font-medium tracking-wide">
                    inspired by The Glasshouse · Lady Ashmore
                  </div>
                  <button 
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white shadow-sm transition-transform hover:-translate-y-px active:translate-y-0"
                    style={{ backgroundColor: "#C87560" }}
                  >
                    <span>Use this</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Input */}
            <div className="ml-7 flex gap-2">
              <input 
                type="text" 
                placeholder="Or describe your own idea..."
                className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none border focus:border-[#C87560] transition-colors"
                style={{ 
                  backgroundColor: "#FDFAF7", 
                  borderColor: "#DDD4C4",
                  color: "#1B2A4A"
                }}
              />
              <button 
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium text-white shadow-sm transition-transform hover:-translate-y-px active:translate-y-0"
                style={{ backgroundColor: "#1B2A4A" }}
              >
                <span>Generate</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Load more */}
            <div className="ml-7 mt-8 text-center">
              <button 
                className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
                style={{ color: "#C87560" }}
              >
                <span>Load more ideas</span>
                <ArrowDown size={14} />
              </button>
            </div>
            
            {/* Bottom padding spacer */}
            <div className="h-20"></div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div 
          className="w-[280px] shrink-0 border-l flex flex-col h-full overflow-y-auto"
          style={{ backgroundColor: "#F4EFE8", borderColor: "#DDD4C4" }}
        >
          <div className="p-5 flex flex-col h-full">
            
            {/* Mentions */}
            <div className="mb-6">
              <h3 className="text-xs font-bold tracking-wider uppercase text-[#1B2A4A]/50 mb-3">
                Also in Wychcombe
              </h3>
              
              <div className="flex flex-wrap gap-2 mb-4">
                <div 
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border"
                  style={{ backgroundColor: "#EFE9E1", borderColor: "#DDD4C4", color: "#1B2A4A" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                  Lady Ashmore
                </div>
                
                <div 
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border"
                  style={{ backgroundColor: "#EFE9E1", borderColor: "#DDD4C4", color: "#1B2A4A" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#C87560" }}></div>
                  Fog & Gaslight
                </div>
                
                <div 
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border"
                  style={{ backgroundColor: "#EFE9E1", borderColor: "#DDD4C4", color: "#1B2A4A" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                  The Obsidian Mirror
                </div>
                
                <div 
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border"
                  style={{ backgroundColor: "#EFE9E1", borderColor: "#DDD4C4", color: "#1B2A4A" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                  Quiet Dread
                </div>
              </div>
              
              <button className="text-[11px] font-medium flex items-center gap-1 hover:underline text-[#1B2A4A]/70">
                View all <ArrowRight size={10} />
              </button>
            </div>
            
            <div 
              className="w-full h-px my-4" 
              style={{ backgroundColor: "#DDD4C4" }}
            ></div>
            
            {/* Admin Fold */}
            <div className="mt-2">
              <button className="w-full flex items-center justify-between py-2 text-[#1B2A4A]/60 hover:text-[#1B2A4A] transition-colors group">
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">Record Details</span>
                  <span className="text-[11px] opacity-70">Status, type, and editorial notes</span>
                </div>
                <ChevronDown size={16} className="opacity-50 group-hover:opacity-100" />
              </button>
            </div>
            
            <div className="mt-auto pt-8">
              <div className="text-[11px] text-[#1B2A4A]/40 text-center">
                Last edited · 2 hours ago
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
