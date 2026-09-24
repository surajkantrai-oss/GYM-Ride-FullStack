import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

export type AppIconName =
  | "arrow-left"
  | "arrow-right"
  | "bell"
  | "calendar"
  | "chevron-down"
  | "compass"
  | "dumbbell"
  | "globe"
  | "heart"
  | "home"
  | "location"
  | "search"
  | "sliders"
  | "spark"
  | "star"
  | "user";

export function AppIcon({
  name,
  size = 24,
  color = "currentColor",
  filled = false,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
  filled?: boolean;
}) {
  const common = {
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === "home" && (
        <>
          <Path d="M3.5 10.7 12 3.8l8.5 6.9" {...common} />
          <Path
            d="M5.7 9.3v10.2h12.6V9.3M9.5 19.5v-5.8h5v5.8"
            {...common}
            fill={filled ? color : "none"}
          />
        </>
      )}
      {name === "compass" && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...common} />
          <Path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5 5.5-2.1Z" {...common} fill={filled ? color : "none"} />
        </>
      )}
      {name === "dumbbell" && (
        <>
          <Rect x="2.7" y="8" width="2.7" height="8" rx="1.1" {...common} fill={filled ? color : "none"} />
          <Rect x="6" y="6.2" width="3" height="11.6" rx="1.2" {...common} fill={filled ? color : "none"} />
          <Line x1="9.2" y1="12" x2="14.8" y2="12" {...common} />
          <Rect x="15" y="6.2" width="3" height="11.6" rx="1.2" {...common} fill={filled ? color : "none"} />
          <Rect x="18.6" y="8" width="2.7" height="8" rx="1.1" {...common} fill={filled ? color : "none"} />
        </>
      )}
      {name === "globe" && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...common} />
          <Path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5M12 3.5C9.8 5.8 8.7 8.6 8.7 12s1.1 6.2 3.3 8.5" {...common} />
        </>
      )}
      {name === "heart" && (
        <Path d="M20.5 8.9c0 5.2-8.5 10.3-8.5 10.3S3.5 14.1 3.5 8.9A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.5 2.5Z" {...common} fill={filled ? color : "none"} />
      )}
      {name === "calendar" && (
        <>
          <Rect x="3.8" y="5.2" width="16.4" height="15" rx="2.4" {...common} fill={filled ? color : "none"} />
          <Line x1="7.8" y1="3.5" x2="7.8" y2="7.2" {...common} />
          <Line x1="16.2" y1="3.5" x2="16.2" y2="7.2" {...common} />
          <Line x1="4" y1="9" x2="20" y2="9" {...common} />
        </>
      )}
      {name === "user" && (
        <>
          <Circle cx="12" cy="8" r="3.5" {...common} fill={filled ? color : "none"} />
          <Path d="M4.8 20c.6-4 3.2-6.1 7.2-6.1s6.6 2.1 7.2 6.1" {...common} />
        </>
      )}
      {name === "bell" && (
        <>
          <Path d="M6.2 10.3c0-3.6 2.2-6 5.8-6s5.8 2.4 5.8 6v4.1l1.7 2.2H4.5l1.7-2.2v-4.1Z" {...common} fill={filled ? color : "none"} />
          <Path d="M9.8 19.2c.5.7 1.2 1 2.2 1s1.7-.3 2.2-1" {...common} />
        </>
      )}
      {name === "search" && (
        <>
          <Circle cx="10.5" cy="10.5" r="6.2" {...common} />
          <Line x1="15" y1="15" x2="20" y2="20" {...common} />
        </>
      )}
      {name === "location" && (
        <>
          <Circle cx="12" cy="10" r="2.6" {...common} fill={filled ? color : "none"} />
          <Path d="M19 10c0 5-7 10.2-7 10.2S5 15 5 10a7 7 0 1 1 14 0Z" {...common} />
        </>
      )}
      {name === "star" && (
        <Path d="m12 3 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.2 6-.8L12 3Z" {...common} fill={filled ? color : "none"} />
      )}
      {name === "spark" && (
        <>
          <Path d="M12 2.8 13.8 9l5.5 3-5.5 3-1.8 6.2L10.2 15l-5.5-3 5.5-3L12 2.8Z" {...common} fill={filled ? color : "none"} />
        </>
      )}
      {name === "sliders" && (
        <>
          <Line x1="4" y1="6" x2="20" y2="6" {...common} />
          <Circle cx="9" cy="6" r="2" {...common} fill={filled ? color : "none"} />
          <Line x1="4" y1="12" x2="20" y2="12" {...common} />
          <Circle cx="15" cy="12" r="2" {...common} fill={filled ? color : "none"} />
          <Line x1="4" y1="18" x2="20" y2="18" {...common} />
          <Circle cx="11" cy="18" r="2" {...common} fill={filled ? color : "none"} />
        </>
      )}
      {name === "arrow-left" && <Path d="m14.5 5-7 7 7 7M8 12h11" {...common} />}
      {name === "arrow-right" && <Path d="m9.5 5 7 7-7 7M16 12H5" {...common} />}
      {name === "chevron-down" && <Path d="m7 9.5 5 5 5-5" {...common} />}
    </Svg>
  );
}
