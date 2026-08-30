import React, { useEffect, useState } from "react";
import { ArrowUpIcon } from "./GovernmentIcons.js";

export function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const checkLengthy = () => {
      // Show button if the page content is taller than the viewport (page is lengthy)
      if (document.documentElement.scrollHeight > window.innerHeight * 1.2) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    checkLengthy();

    const observer = new MutationObserver(checkLengthy);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", checkLengthy);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", checkLengthy);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!isVisible) return null;

  return (
    <button
      className="gov-back-to-top"
      onClick={scrollToTop}
      aria-label="Scroll back to top of page"
      title="Scroll to top"
    >
      <ArrowUpIcon size={24} />
    </button>
  );
}
