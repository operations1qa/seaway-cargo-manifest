import React from "react";

interface SeawayLogoProps {
  height?: number;
  textColor?: string;
  barsColor?: string;
  theme?: "light" | "dark";
}

export const SeawayLogo: React.FC<SeawayLogoProps> = ({
  height = 28,
  textColor,
  barsColor,
  theme = "light",
}) => {
  // Determine standard colors to perfectly match the user's company logo attachment
  const defaultText = theme === "dark" ? "#ffffff" : "#09249e"; // Elegant deep royal blue
  const defaultBars = "#00a2e8"; // Vibrant cyan/sky blue for the parallel horizontal bars of the "E"

  const textC = textColor || defaultText;
  const barsC = barsColor || defaultBars;

  return (
    <svg
      viewBox="0 0 170 38"
      style={{
        height: `${height}px`,
        width: "auto",
        display: "inline-block",
        verticalAlign: "middle",
        userSelect: "none"
      }}
      aria-label="Seaway Logo"
    >
      {/* Capital "S" */}
      <text
        x="2"
        y="30"
        fill={textC}
        style={{
          fontFamily: "'Inter', 'Montserrat', -apple-system, sans-serif",
          fontWeight: 950,
          fontSize: "30px",
          letterSpacing: "-0.5px"
        }}
      >
        S
      </text>

      {/* Modern "E" represented by 3 customized horizontal Bars */}
      <rect x="25" y="10" width="20" height="4.5" rx="1.5" fill={barsC} />
      <rect x="25" y="17.5" width="20" height="4.5" rx="1.5" fill={barsC} />
      <rect x="25" y="25" width="20" height="4.5" rx="1.5" fill={barsC} />

      {/* "AWAY" written in bold geometric capital letters */}
      <text
        x="51"
        y="30"
        fill={textC}
        style={{
          fontFamily: "'Inter', 'Montserrat', -apple-system, sans-serif",
          fontWeight: 950,
          fontSize: "30px",
          letterSpacing: "0.2px"
        }}
      >
        AWAY
      </text>
    </svg>
  );
};
