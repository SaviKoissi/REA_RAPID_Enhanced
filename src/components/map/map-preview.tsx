"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type LeafletModules = {
  L: typeof import("leaflet")
  MapContainer: typeof import("react-leaflet").MapContainer
  TileLayer: typeof import("react-leaflet").TileLayer
  Marker: typeof import("react-leaflet").Marker
  Popup: typeof import("react-leaflet").Popup
}

export interface MapPreviewProps {
  center?: [number, number]
  zoom?: number
  markers?: Array<{ position: [number, number]; label?: string }>
  className?: string
}

export function MapPreview({ center = [-1.5, -20], zoom = 4, markers, className }: MapPreviewProps) {
  const [modules, setModules] = useState<LeafletModules | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    Promise.all([import("leaflet"), import("react-leaflet")]).then(([L, RL]) => {
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
      })
    })
  }, [])

  if (!modules) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg border border-input", className)}>
        <div className="h-full w-full bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">Map</div>
      </div>
    )
  }

  const { L, MapContainer, TileLayer, Marker, Popup } = modules
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-input", className)}>
      <MapContainer center={center} zoom={zoom} minZoom={2} maxZoom={18} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {markers?.map((m, i) => (
          <Marker key={i} position={m.position}>
            <Popup>{m.label}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
