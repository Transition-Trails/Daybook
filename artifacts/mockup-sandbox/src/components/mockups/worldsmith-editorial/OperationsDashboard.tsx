import React from "react";
import { 
  LayoutDashboard, 
  CheckSquare, 
  FileText, 
  BookOpen, 
  Puzzle, 
  Settings, 
  HelpCircle,
  Globe,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Check
} from "lucide-react";

const ReadinessCircle = ({ percent }: { percent: number }) => {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;
  
  let colorClass = "text-gray-300";
  let trailClass = "text-gray-100";
  if (percent >= 80) {
    colorClass = "text-teal-500";
    trailClass = "text-teal-50";
  } else if (percent >= 50) {
    colorClass = "text-amber-500";
    trailClass = "text-amber-50";
  } else if (percent > 0) {
    colorClass = "text-gray-400";
  }

  return (
    <div className="relative w-6 h-6 flex items-center justify-center">
      <svg className="w-6 h-6 -rotate-90 transform" viewBox="0 0 24 24">
        <circle
          className={trailClass}
          strokeWidth="2.5"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="12"
          cy="12"
        />
        <circle
          className={colorClass}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="12"
          cy="12"
        />
      </svg>
    </div>
  );
};

type SpecCardProps = {
  type: string; // 'Hero Paper' | 'Decorative Paper' | 'Journal Card' | 'Ephemera'
  title: string;
  percent: number;
  timeAgo: string;
  hasCanonIssue?: boolean;
  isCompiled?: boolean;
  validationErrors?: string;
  blocked?: boolean;
};

const SpecCard = ({ 
  type, 
  title, 
  percent, 
  timeAgo, 
  hasCanonIssue, 
  isCompiled, 
  validationErrors,
  blocked 
}: SpecCardProps) => {
  let pillBg = "bg-gray-100";
  let pillText = "text-gray-700";

  if (type === "Hero Paper") {
    pillBg = "bg-[#C87560]/10";
    pillText = "text-[#C87560]";
  } else if (type === "Decorative Paper") {
    pillBg = "bg-blue-100";
    pillText = "text-blue-700";
  } else if (type === "Journal Card") {
    pillBg = "bg-violet-100";
    pillText = "text-violet-700";
  } else if (type === "Ephemera") {
    pillBg = "bg-amber-100";
    pillText = "text-amber-700";
  }

  return (
    <div className={`bg-white rounded-lg border shadow-sm p-3 mb-3 space-y-2.5 ${blocked ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${pillBg} ${pillText}`}>
          {type}
        </span>
        <ReadinessCircle percent={percent} />
      </div>
      
      <h4 className="text-sm font-medium text-gray-800 leading-snug">
        {title}
      </h4>
      
      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] font-medium text-gray-400">{timeAgo}</span>
        
        {hasCanonIssue && (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        )}
        
        {isCompiled && !validationErrors && (
          <div className="flex items-center gap-1 bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
            <Check className="w-3 h-3" />
            Ready to publish
          </div>
        )}
        
        {validationErrors && (
          <span className="text-[11px] font-medium text-red-600">
            {validationErrors}
          </span>
        )}
      </div>
    </div>
  );
};

export default function OperationsDashboard() {
  return (
    <div className="min-h-screen flex w-full font-sans text-gray-900 bg-[#F4F5F7]">
      {/* LEFT SIDEBAR */}
      <aside className="w-[240px] bg-[#1B2A4A] text-white flex flex-col shrink-0 overflow-y-auto">
        <div className="p-5 pb-2">
          <h1 className="font-serif text-[20px] font-medium leading-tight">WorldSmith</h1>
          <h2 className="font-serif text-[12px] text-blue-200/80 italic">Editorial Suite</h2>
        </div>

        <button className="flex items-center justify-between bg-[#243654] rounded-lg mx-3 my-4 p-2.5 hover:bg-[#2A3F61] transition-colors group">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-300" />
            <span className="text-sm font-medium">Wychcombe</span>
          </div>
          <ChevronDown className="w-4 h-4 text-blue-300/70 group-hover:text-white" />
        </button>

        <div className="flex-1 mt-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300/60 mx-5 mb-2">
            Workspace
          </div>
          <nav className="space-y-1 px-3">
            <a href="#" className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#00A99D]/20 text-[#00A99D] font-medium text-sm">
              <LayoutDashboard className="w-4 h-4" />
              Readiness Board
            </a>
            <a href="#" className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors text-sm">
              <CheckSquare className="w-4 h-4" />
              Canon Board
            </a>
            <a href="#" className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors text-sm">
              <FileText className="w-4 h-4" />
              Production Specs
            </a>
            <a href="#" className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors text-sm">
              <BookOpen className="w-4 h-4" />
              Style Guides
            </a>
            <a href="#" className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors text-sm">
              <Puzzle className="w-4 h-4" />
              Prompt Modules
            </a>
          </nav>
        </div>

        <div className="px-5 py-4 border-t border-white/10">
          <nav className="space-y-1 mb-4">
            <a href="#" className="flex items-center gap-3 py-1.5 text-gray-300 hover:text-white transition-colors text-sm">
              <Settings className="w-4 h-4" />
              Settings
            </a>
            <a href="#" className="flex items-center gap-3 py-1.5 text-gray-300 hover:text-white transition-colors text-sm">
              <HelpCircle className="w-4 h-4" />
              Help & Support
            </a>
          </nav>
          
          <div className="flex items-center gap-3 mt-6">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-bold ring-1 ring-blue-500/30">
              CD
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Creative Director</span>
              <span className="text-xs text-blue-300/70">Wychcombe</span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* TOP BAR */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 h-[60px]">
          <div className="flex items-center">
            <div className="flex items-center text-sm font-medium text-gray-500">
              <span className="hover:text-gray-800 cursor-pointer">Wychcombe</span>
              <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-gray-400" />
              <span className="hover:text-gray-800 cursor-pointer">Summer 2025</span>
              <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-gray-400" />
              <span className="text-gray-900">Readiness Board</span>
            </div>
          </div>
          
          <div className="absolute left-1/2 -translate-x-1/2">
            <button className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-3.5 py-1 text-sm font-medium transition-colors">
              Summer 2025
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center">
            <div className="flex items-center gap-3 text-sm text-gray-600 font-medium">
              <span>15 specs</span>
              <span className="text-gray-300">•</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span>3 errors</span>
              </div>
              <span className="text-gray-300">•</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>2 awaiting canon</span>
              </div>
            </div>
            
            <div className="w-px h-5 bg-gray-200 mx-5"></div>
            
            <button className="bg-[#1B2A4A] hover:bg-[#2A3F61] text-white rounded-md px-4 py-1.5 text-sm font-medium shadow-sm transition-colors">
              Batch Compile
            </button>
          </div>
        </header>

        {/* SWIMLANE BOARD */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
          <div className="flex gap-4 h-full min-w-max items-start">
            
            {/* COLUMN: Drafts */}
            <div className="w-[260px] flex flex-col max-h-full">
              <div className="bg-gray-100 text-gray-700 rounded-t-lg px-3 py-2.5 flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Drafts</span>
                <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">2</span>
              </div>
              <div className="flex-1 overflow-y-auto pb-4 hide-scrollbar">
                <SpecCard 
                  type="Decorative Paper" 
                  title="V01·DP·007 Midnight Botanicals" 
                  percent={15} 
                  timeAgo="4h ago" 
                />
                <SpecCard 
                  type="Journal Card" 
                  title="V01·JC·012 Study Notes" 
                  percent={45} 
                  timeAgo="1d ago" 
                />
              </div>
            </div>

            {/* COLUMN: Payload Ready */}
            <div className="w-[260px] flex flex-col max-h-full">
              <div className="bg-blue-50 border-b border-blue-100 text-blue-700 rounded-t-lg px-3 py-2.5 flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Payload Ready</span>
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">4</span>
              </div>
              <div className="flex-1 overflow-y-auto pb-4 hide-scrollbar">
                <SpecCard 
                  type="Hero Paper" 
                  title="V01·HP·001 The Hearth" 
                  percent={65} 
                  timeAgo="2d ago" 
                />
                <SpecCard 
                  type="Decorative Paper" 
                  title="V01·DP·003 Aged Vellum" 
                  percent={70} 
                  timeAgo="3d ago" 
                  hasCanonIssue
                />
                <SpecCard 
                  type="Journal Card" 
                  title="V01·JC·005 Field Notes" 
                  percent={55} 
                  timeAgo="4d ago" 
                />
                <SpecCard 
                  type="Ephemera" 
                  title="V01·EP·002 Letter Seal" 
                  percent={60} 
                  timeAgo="4d ago" 
                />
              </div>
            </div>

            {/* COLUMN: Canon Clear */}
            <div className="w-[260px] flex flex-col max-h-full">
              <div className="bg-violet-50 border-b border-violet-100 text-violet-700 rounded-t-lg px-3 py-2.5 flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Canon Clear</span>
                <span className="bg-violet-100 text-violet-800 text-xs font-bold px-2 py-0.5 rounded-full">3</span>
              </div>
              <div className="flex-1 overflow-y-auto pb-4 hide-scrollbar">
                <SpecCard 
                  type="Hero Paper" 
                  title="V01·HP·002 The Armchair" 
                  percent={85} 
                  timeAgo="1d ago" 
                />
                <SpecCard 
                  type="Decorative Paper" 
                  title="V01·DP·005 Marbled End" 
                  percent={90} 
                  timeAgo="2d ago" 
                />
                <SpecCard 
                  type="Journal Card" 
                  title="V01·JC·008 Pressed Flowers" 
                  percent={80} 
                  timeAgo="2d ago" 
                />
              </div>
            </div>

            {/* COLUMN: Compiled */}
            <div className="w-[260px] flex flex-col max-h-full">
              <div className="bg-teal-50 border-b border-teal-100 text-teal-700 rounded-t-lg px-3 py-2.5 flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Compiled</span>
                <span className="bg-teal-100 text-teal-800 text-xs font-bold px-2 py-0.5 rounded-full">5</span>
              </div>
              <div className="flex-1 overflow-y-auto pb-4 hide-scrollbar">
                <SpecCard 
                  type="Hero Paper" 
                  title="V01·HP·003 The Window Seat" 
                  percent={100} 
                  timeAgo="5h ago" 
                  isCompiled
                />
                <SpecCard 
                  type="Decorative Paper" 
                  title="V01·DP·001 Heritage Floral" 
                  percent={100} 
                  timeAgo="1d ago" 
                  isCompiled
                />
                <SpecCard 
                  type="Decorative Paper" 
                  title="V01·DP·002 Linen Weave" 
                  percent={100} 
                  timeAgo="1d ago" 
                  isCompiled
                />
                <SpecCard 
                  type="Journal Card" 
                  title="V01·JC·003 Diary Pages" 
                  percent={100} 
                  timeAgo="2d ago" 
                  isCompiled
                />
                <SpecCard 
                  type="Journal Card" 
                  title="V01·JC·007 Wax Seal" 
                  percent={100} 
                  timeAgo="2d ago" 
                  isCompiled
                />
              </div>
            </div>

            {/* COLUMN: Published */}
            <div className="w-[260px] flex flex-col max-h-full opacity-60 hover:opacity-100 transition-opacity">
              <div className="bg-green-50 border-b border-green-100 text-green-700 rounded-t-lg px-3 py-2.5 flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Published</span>
                <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full">1</span>
              </div>
              <div className="flex-1 overflow-y-auto pb-4 hide-scrollbar">
                <SpecCard 
                  type="Decorative Paper" 
                  title="V01·DP·004 Toile de Jouy" 
                  percent={100} 
                  timeAgo="3d ago" 
                />
              </div>
            </div>

            {/* COLUMN: Blocked */}
            <div className="w-[260px] flex flex-col max-h-full">
              <div className="bg-red-50 border-b border-red-100 text-red-700 rounded-t-lg px-3 py-2.5 flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Blocked</span>
                <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded-full">1</span>
              </div>
              <div className="flex-1 overflow-y-auto pb-4 hide-scrollbar">
                <SpecCard 
                  type="Hero Paper" 
                  title="V01·HP·004 The Library Table" 
                  percent={100} 
                  timeAgo="1h ago" 
                  blocked
                  validationErrors="4 validation errors"
                />
              </div>
            </div>

          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
