import React, { useState } from 'react';
import { MapPin, ChevronLeft, ChevronRight, Sparkles, Image as ImageIcon } from 'lucide-react';

export default function TheScroll() {
  const [mood, setMood] = useState('Mysterious & Dark');
  const [scene, setScene] = useState('A person is there');
  const [detail, setDetail] = useState('Rich');

  return (
    <div 
      className="min-h-screen flex flex-col" 
      style={{ 
        backgroundColor: '#FDFAF7', 
        color: '#1B2A4A',
        fontFamily: "'Instrument Sans', sans-serif" 
      }}
    >
      {/* Top Bar */}
      <header 
        className="h-[52px] flex items-center justify-between px-6 shrink-0 w-full"
        style={{ backgroundColor: '#1B2A4A', color: '#FFFFFF' }}
      >
        <button className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" /> Lady Ashmore
        </button>
        <h1 
          className="text-[18px]" 
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          The Glasshouse
        </h1>
        <div className="flex items-center gap-6">
          <button className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors">
            The East Wing <ChevronRight className="w-4 h-4" />
          </button>
          <span 
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: '#C87560' }}
          >
            Wychcombe
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex max-w-[1280px] w-full mx-auto relative items-stretch">
        {/* Left Column */}
        <div 
          className="flex-1 pt-[48px] pb-[96px] pl-[48px] pr-[64px]"
          style={{ backgroundColor: '#FDFAF7' }}
        >
          <div className="flex items-center gap-1.5 mb-4">
            <MapPin className="w-3.5 h-3.5" style={{ color: '#C87560' }} />
            <span 
              className="text-[11px] font-bold tracking-widest uppercase"
              style={{ color: '#C87560' }}
            >
              Location
            </span>
          </div>
          
          <h2 
            className="text-[52px] leading-[1.1] mb-2"
            style={{ fontFamily: "'Playfair Display', serif", color: '#1B2A4A' }}
          >
            The Glasshouse
          </h2>
          
          <div className="text-[12px] opacity-60 mb-8 font-medium">
            Accepted into canon · WYC-LOC-004
          </div>
          
          <hr className="border-t mb-8" style={{ borderColor: '#DDD4C4' }} />
          
          <div className="mb-12">
            <h3 className="text-[11px] font-bold tracking-widest uppercase opacity-50 mb-5">
              The Story
            </h3>
            <p 
              className="text-[19px] leading-[1.8] opacity-90"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              An overgrown Victorian glasshouse at the edge of the estate grounds. Iron frames bow under the weight of wisteria, their joints bleeding rust onto cracked stone pathways. Inside, warm lantern light filters through broken panes, catching dust motes and the pale green of unchecked ferns. Something thrives here still, despite — or because of — the neglect.
            </p>
          </div>
          
          <div className="mb-10">
            <h3 className="text-[11px] font-bold tracking-widest uppercase opacity-50 mb-5">
              Your Notes
            </h3>
            <textarea 
              className="w-full bg-transparent border-0 outline-none resize-none text-[15px] opacity-80 placeholder:opacity-40 focus:ring-0"
              style={{ fontFamily: "'Instrument Sans', sans-serif" }}
              placeholder="Add your own thoughts about this place..."
              rows={4}
            />
          </div>
          
          <div className="flex flex-wrap gap-2 text-[13px] opacity-60 mt-12">
            Related: 
            <span className="underline decoration-black/20 underline-offset-4 cursor-pointer hover:opacity-100 ml-1">
              Lady Ashmore
            </span> · 
            <span className="underline decoration-black/20 underline-offset-4 cursor-pointer hover:opacity-100">
              Fog & Gaslight
            </span> · 
            <span className="underline decoration-black/20 underline-offset-4 cursor-pointer hover:opacity-100">
              Quiet Dread
            </span>
          </div>
        </div>

        {/* Right Column */}
        <div 
          className="w-[380px] shrink-0 sticky top-0 border-l pt-[48px] px-8 pb-12 flex flex-col h-[calc(100vh-52px)] overflow-y-auto"
          style={{ backgroundColor: '#EFE9E1', borderColor: '#DDD4C4' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span style={{ color: '#1B2A4A', fontSize: '20px' }}>✦</span>
            <h2 
              className="text-[22px]"
              style={{ fontFamily: "'Playfair Display', serif", color: '#1B2A4A' }}
            >
              Create an Image
            </h2>
          </div>
          <p className="text-[13px] opacity-60 mb-6">
            Answer a few questions — we'll write the prompt for you
          </p>
          
          <hr className="border-t mb-8" style={{ borderColor: '#DDD4C4' }} />
          
          {/* Step 1 */}
          <div className="mb-6">
            <h3 className="text-[13px] font-semibold mb-3">1. What's the mood?</h3>
            <div className="flex flex-col gap-2">
              {['Mysterious & Dark', 'Quiet & Beautiful', 'Eerie & Unsettling'].map(opt => (
                <button 
                  key={opt}
                  onClick={() => setMood(opt)}
                  className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors border"
                  style={{ 
                    backgroundColor: mood === opt ? '#1B2A4A' : 'transparent',
                    color: mood === opt ? '#FFFFFF' : '#1B2A4A',
                    borderColor: mood === opt ? '#1B2A4A' : '#DDD4C4'
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          
          {/* Step 2 */}
          <div className="mb-6">
            <h3 className="text-[13px] font-semibold mb-3">2. What's in the scene?</h3>
            <div className="flex flex-col gap-2">
              {['Just the place', 'A person is there', 'A key object'].map(opt => (
                <button 
                  key={opt}
                  onClick={() => setScene(opt)}
                  className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors border"
                  style={{ 
                    backgroundColor: scene === opt ? '#1B2A4A' : 'transparent',
                    color: scene === opt ? '#FFFFFF' : '#1B2A4A',
                    borderColor: scene === opt ? '#1B2A4A' : '#DDD4C4'
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          
          {/* Step 3 */}
          <div className="mb-8">
            <h3 className="text-[13px] font-semibold mb-3">3. How much detail?</h3>
            <div 
              className="flex rounded-lg p-1"
              style={{ backgroundColor: 'rgba(221, 212, 196, 0.4)' }}
            >
              {['Simple', 'Rich', 'Very detailed'].map(opt => (
                <button 
                  key={opt}
                  onClick={() => setDetail(opt)}
                  className="flex-1 text-center py-2 rounded-md text-xs font-medium transition-colors"
                  style={{ 
                    backgroundColor: detail === opt ? '#FFFFFF' : 'transparent',
                    color: '#1B2A4A',
                    boxShadow: detail === opt ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          
          {/* Assembled Prompt */}
          <div className="mt-auto">
            <h3 className="text-[11px] font-bold tracking-widest uppercase opacity-50 mb-3">
              Your prompt
            </h3>
            <div 
              className="rounded-xl p-[14px] mb-6 border border-l-4"
              style={{ 
                backgroundColor: '#EFE9E1', 
                borderLeftColor: '#C87560', 
                borderColor: '#DDD4C4',
              }}
            >
              <p 
                className="italic text-[14.5px] leading-relaxed opacity-90"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Lady Ashmore standing in the doorway of The Glasshouse at night, iron frames tangled with wisteria, fog drifting through broken panes, gaslight from within casting long shadows, Victorian Gothic mood, mysterious and atmospheric, richly detailed
              </p>
            </div>
            
            <button 
              className="w-full h-[48px] rounded-xl font-semibold flex items-center justify-center gap-2 mb-4 transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#C87560', color: '#FFFFFF' }}
            >
              <ImageIcon className="w-4 h-4" />
              Generate Image <ChevronRight className="w-4 h-4" />
            </button>
            <div className="text-center">
              <button className="text-[12px] opacity-60 hover:opacity-100 underline decoration-black/20 underline-offset-4">
                Edit prompt manually
              </button>
            </div>
          </div>
          
        </div>
      </main>
    </div>
  );
}
