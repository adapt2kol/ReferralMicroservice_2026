"use client";

import { useState, useCallback } from "react";

interface CopyLinkProps {
  link: string;
  accentColor: string;
}

export default function CopyLink({ link, accentColor }: CopyLinkProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = link;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback failed - user will need to copy manually
      }
      document.body.removeChild(textArea);
    }
  }, [link]);

  return (
    <div className="flex flex-col sm:flex-row gap-2 w-full">
      <input
        type="text"
        readOnly
        value={link}
        className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm font-mono truncate focus:outline-none focus:ring-2 focus:ring-offset-1"
        style={{ 
          focusRing: accentColor,
        } as React.CSSProperties}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        aria-label="Your referral link"
      />
      <button
        onClick={handleCopy}
        className="px-6 py-3 rounded-lg font-medium text-white transition-all duration-200 hover:opacity-90 active:scale-95 min-w-[100px]"
        style={{ backgroundColor: accentColor }}
        aria-label={copied ? "Link copied to clipboard" : "Copy referral link to clipboard"}
      >
        {copied ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Copied!
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy
          </span>
        )}
      </button>
      {copied && (
        <div role="status" aria-live="polite" className="sr-only">
          Link copied to clipboard
        </div>
      )}
    </div>
  );
}
