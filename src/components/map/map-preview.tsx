"use client"

import { useEffect, useState } from "react"
import "leaflet/dist/leaflet.css"
import { cn } from "@/lib/utils"

type LeafletModules = {
  L: typeof import("leaflet")
  MapContainer: typeof import("react-leaflet").MapContainer
  TileLayer: typeof import("react-leaflet").TileLayer
  Marker: typeof import("react-leaflet").Marker
  Popup: typeof import("react-leaflet").Popup
  GeoJSON: typeof import("react-leaflet").GeoJSON
}

export interface MapPreviewProps {
  center?: [number, number]
  zoom?: number
  markers?: Array<{ position: [number, number]; label?: string }>
  layers?: Array<{
    id?: string
    name?: string
    visible?: boolean
    opacity?: number
    data?: unknown
  }>
  className?: string
}

function getRiskColor(val: number): string {
  if (val >= 0.75) return "#dc2626"
  if (val >= 0.5) return "#ea580c"
  if (val >= 0.25) return "#eab308"
  return "#16a34a"
}

export function MapPreview({ center = [7.8, 8.6], zoom = 6, markers, layers, className }: MapPreviewProps) {
  const [modules, setModules] = useState<LeafletModules | null>(null)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const syncTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"))
    }
    syncTheme()
    const obs = new MutationObserver(syncTheme)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([import("leaflet"), import("react-leaflet")]).then(([L, RL]) => {
      if (!active) return
      L.default.Marker.prototype.options.icon = L.default.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      })
      setModules({
        L: L.default,
        MapContainer: RL.MapContainer,
        TileLayer: RL.TileLayer,
        Marker: RL.Marker,
        Popup: RL.Popup,
        GeoJSON: RL.GeoJSON,
      })
    })
    return () => {
      active = false
    }
  }, [])

  if (!modules) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg border border-input bg-muted/40", className)}>
        <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
          Loading host map ({center[0].toFixed(1)}, {center[1].toFixed(1)})...
        </div>
      </div>
    )
  }

  const { MapContainer, TileLayer, Marker, Popup, GeoJSON } = modules
  const mapKey = `${center[0].toFixed(3)}-${center[1].toFixed(3)}-${zoom}-${isDark ? "dark" : "light"}`
  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"

  const visibleGeoLayers = (layers ?? []).filter(
    (l) => l.visible !== false && l.data && typeof l.data === "object"
  )

  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-input bg-emerald-950/10", className)}>
      <MapContainer
        key={mapKey}
        center={center}
        zoom={zoom}
        minZoom={2}
        maxZoom={18}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        className="h-full w-full z-0"
      >
        <TileLayer url={tileUrl} attribution="&copy; OpenStreetMap &copy; CARTO" />
        {visibleGeoLayers.map((layer, idx) => (
          <GeoJSON
            key={layer.id ?? `layer-${idx}`}
            data={layer.data as GeoJSON.GeoJsonObject}
            style={(feature) => {
              const rawVal = Number(
                (feature?.properties as Record<string, unknown> | undefined)?.value ??
                  (feature?.properties as Record<string, unknown> | undefined)?.host_density ??
                  0.4
              )
              return {
                color: isDark ? "#cbd5e1" : "#1e293b",
                weight: 0.75,
                fillColor: getRiskColor(rawVal),
                fillOpacity: Math.min(0.8, Math.max(0.2, layer.opacity ?? 0.55)),
              }
            }}
          />
        ))}
        {markers?.map((m, i) => (
          <Marker key={i} position={m.position}>
            {m.label && <Popup>{m.label}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
