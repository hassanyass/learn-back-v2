import React from 'react';

const DummyCharacter = ({ width = 300, height = 300, className, style }) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width={width} height={height} className={className} style={style}>
            <defs>
                <radialGradient id="ds" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(0,0,0,0.16)" /><stop offset="100%" stopColor="rgba(0,0,0,0)" /></radialGradient>
                <radialGradient id="sk" cx="42%" cy="28%" r="62%"><stop offset="0%" stopColor="#B88A9E" /><stop offset="50%" stopColor="#9E6F89" /><stop offset="100%" stopColor="#895F78" /></radialGradient>
                <linearGradient id="ov" x1=".5" y1="0" x2=".5" y2="1"><stop offset="0%" stopColor="#8A6578" /><stop offset="100%" stopColor="#7A5670" /></linearGradient>
                <linearGradient id="ar" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#A07A90" /><stop offset="100%" stopColor="#8A6479" /></linearGradient>
                {/* Subtle body side shadow for vector depth */}
                <linearGradient id="bs" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(0,0,0,0.06)" /><stop offset="15%" stopColor="rgba(0,0,0,0)" /><stop offset="85%" stopColor="rgba(0,0,0,0)" /><stop offset="100%" stopColor="rgba(0,0,0,0.06)" /></linearGradient>
                {/* Head highlight for soft volume */}
                <radialGradient id="hh" cx="38%" cy="22%" r="35%"><stop offset="0%" stopColor="rgba(255,255,255,0.12)" /><stop offset="100%" stopColor="rgba(255,255,255,0)" /></radialGradient>
            </defs>

            {/* Ground shadow */}
            <ellipse cx="150" cy="294" rx="70" ry="7" fill="url(#ds)" />

            {/* LEFT ARM + MITTEN (one shape, behind body) */}
            <path d="M58,152 C40,158 26,185 24,212 C22,235 26,250 34,258 C42,266 54,264 58,252 C62,238 60,215 58,190 Z" fill="url(#ar)" stroke="#6E5065" strokeWidth="0.8" />

            {/* RIGHT ARM + MITTEN (one shape, behind body) */}
            <path d="M242,152 C260,158 274,185 276,212 C278,235 274,250 266,258 C258,266 246,264 242,252 C238,238 240,215 242,190 Z" fill="url(#ar)" stroke="#6E5065" strokeWidth="0.8" />

            {/* BODY BLOB — single continuous bean, head merges into body, NO neck */}
            <path d="M150,8 C215,8 252,48 252,92 C252,128 250,150 248,165 C245,188 248,210 252,230 C256,246 250,256 228,260 L212,260 L215,278 C215,288 206,294 192,294 L165,294 C160,294 156,288 156,278 L156,264 L144,264 L144,278 C144,288 140,294 135,294 L108,294 C94,294 85,288 85,278 L88,260 L72,260 C50,256 44,246 48,230 C52,210 55,188 52,165 C50,150 48,128 48,92 C48,48 85,8 150,8 Z" fill="url(#sk)" stroke="#6E5065" strokeWidth="1" />
            {/* Side shadow overlay for vector depth */}
            <path d="M150,8 C215,8 252,48 252,92 C252,128 250,150 248,165 C245,188 248,210 252,230 C256,246 250,256 228,260 L212,260 L215,278 C215,288 206,294 192,294 L165,294 C160,294 156,288 156,278 L156,264 L144,264 L144,278 C144,288 140,294 135,294 L108,294 C94,294 85,288 85,278 L88,260 L72,260 C50,256 44,246 48,230 C52,210 55,188 52,165 C50,150 48,128 48,92 C48,48 85,8 150,8 Z" fill="url(#bs)" />
            {/* Head highlight */}
            <ellipse cx="130" cy="50" rx="40" ry="30" fill="url(#hh)" />

            {/* Chin fold shadow */}
            <path d="M108,148 Q150,162 192,148" fill="none" stroke="#7A5A6E" strokeWidth="1.5" opacity="0.2" />
            {/* Subtle chin shadow ellipse */}
            <ellipse cx="150" cy="148" rx="38" ry="5" fill="rgba(0,0,0,0.04)" />

            {/* T-SHIRT body */}
            <path d="M54,142 C54,155 52,168 52,178 L248,178 C248,168 246,155 246,142 C230,134 195,130 150,130 C105,130 70,134 54,142 Z" fill="#173F50" stroke="#0F2F3E" strokeWidth="0.5" />
            {/* Left sleeve */}
            <path d="M54,142 C36,148 24,165 24,178 C24,190 32,196 42,196 C52,196 56,188 56,178 Z" fill="#173F50" stroke="#0F2F3E" strokeWidth="0.5" />
            {/* Right sleeve */}
            <path d="M246,142 C264,148 276,165 276,178 C276,190 268,196 258,196 C248,196 244,188 244,178 Z" fill="#173F50" stroke="#0F2F3E" strokeWidth="0.5" />

            {/* OVERALLS — curved around belly */}
            <path d="M56,168 C54,188 52,210 52,228 C52,244 56,254 72,260 L228,260 C244,254 248,244 248,228 C248,210 246,188 244,168 Z" fill="url(#ov)" stroke="#5E3F52" strokeWidth="0.8" />
            {/* Left leg */}
            <path d="M88,258 L85,278 C85,288 94,294 108,294 L135,294 C140,294 144,288 144,278 L144,258 Z" fill="url(#ov)" stroke="#5E3F52" strokeWidth="0.8" />
            {/* Left cuff */}
            <path d="M86,278 C88,284 96,288 108,288 L132,288 C140,288 143,284 143,278" fill="none" stroke="#5E3F52" strokeWidth="1.2" />
            {/* Right leg */}
            <path d="M156,258 L156,278 C156,288 160,294 165,294 L192,294 C206,294 215,288 215,278 L212,258 Z" fill="url(#ov)" stroke="#5E3F52" strokeWidth="0.8" />
            {/* Right cuff */}
            <path d="M157,278 C158,284 162,288 172,288 L190,288 C204,288 213,284 214,278" fill="none" stroke="#5E3F52" strokeWidth="1.2" />
            {/* Left strap */}
            <path d="M100,168 L96,142 C95,134 98,130 104,130 L118,130 C122,130 123,134 122,142 L118,168" fill="#8A6578" stroke="#5E3F52" strokeWidth="0.8" />
            {/* Right strap */}
            <path d="M182,168 L178,142 C177,134 180,130 186,130 L200,130 C204,130 205,134 204,142 L200,168" fill="#8A6578" stroke="#5E3F52" strokeWidth="0.8" />
            {/* Buttons */}
            <circle cx="100" cy="170" r="4" fill="#E8B945" stroke="#C9A035" strokeWidth="0.5" />
            <circle cx="200" cy="170" r="4" fill="#E8B945" stroke="#C9A035" strokeWidth="0.5" />
            {/* Center pocket */}
            <path d="M127,190 L127,220 C127,226 132,228 138,228 L162,228 C168,228 173,226 173,220 L173,190 Z" fill="#7BAD8E" stroke="#5B8A6B" strokeWidth="0.8" />
            {/* Left side pocket (semicircle) */}
            <path d="M52,232 C52,252 64,262 88,262 L88,232 Z" fill="#7BAD8E" stroke="#5B8A6B" strokeWidth="0.8" />
            {/* Right side pocket (semicircle) */}
            <path d="M248,232 C248,252 236,262 212,262 L212,232 Z" fill="#7BAD8E" stroke="#5B8A6B" strokeWidth="0.8" />
            {/* Center seam */}
            <line x1="150" y1="232" x2="150" y2="294" stroke="#5E3F52" strokeWidth="0.8" />

            {/* Feet */}
            <ellipse cx="114" cy="295" rx="32" ry="6" fill="#895F78" stroke="#6E5065" strokeWidth="0.8" />
            <ellipse cx="186" cy="295" rx="32" ry="6" fill="#895F78" stroke="#6E5065" strokeWidth="0.8" />

            {/* FACE */}
            {/* Eyebrows — thick, dark, floating */}
            <path d="M100,74 Q114,64 132,70" fill="none" stroke="#2A202A" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M168,70 Q186,64 200,74" fill="none" stroke="#2A202A" strokeWidth="4.5" strokeLinecap="round" />
            {/* Left eye */}
            <ellipse cx="120" cy="96" rx="18" ry="20" fill="#FEFCF9" stroke="#6E5065" strokeWidth="0.8" />
            <circle cx="124" cy="100" r="10" fill="#332222" />
            <circle cx="128" cy="94" r="3" fill="#FFF" />
            <circle cx="121" cy="103" r="1.3" fill="rgba(255,255,255,0.35)" />
            {/* Right eye */}
            <ellipse cx="180" cy="96" rx="18" ry="20" fill="#FEFCF9" stroke="#6E5065" strokeWidth="0.8" />
            <circle cx="176" cy="100" r="10" fill="#332222" />
            <circle cx="180" cy="94" r="3" fill="#FFF" />
            <circle cx="173" cy="103" r="1.3" fill="rgba(255,255,255,0.35)" />
            {/* Mouth — small, low */}
            <path d="M140,126 Q150,134 160,126" fill="none" stroke="#5C3B4A" strokeWidth="2" strokeLinecap="round" />

            <style>{`@keyframes dc-b{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}svg{animation:dc-b 4s ease-in-out infinite}`}</style>
        </svg>
    );
};

export default DummyCharacter;
