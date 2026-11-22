"use client"

import { useEffect, useState } from "react"

type LeafletMapModules = {
  L: typeof import("leaflet")
  MapContainer: typeof import("react-leaflet").MapContainer
  TileLayer: typeof import("react-leaflet").TileLayer
  Marker: typeof import("react-leaflet").Marker
  Popup: typeof import("react-leaflet").Popup
  CircleMarker: typeof import("react-leaflet").CircleMarker
}

export interface MapViewProps {
  center: [number, number]
  zoom: number
  layers: Array<{ id: string; name: string }>
  markers?: Array<{ position: [number, number]; label?: string; color?: string }>
  circles?: Array<{
    position: [number, number]
    radius: number // meters
    color: string
    fill: string
    label?: string
  }>
}

export function MapView({ center, zoom, layers, markers, circles }: MapViewProps) {
  const [modules, setModules] = useState<LeafletMapModules | null>(null)

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
        CircleMarker: RL.CircleMarker,
      })
    })
  }, [])

  if (!modules) return <div className="h-full w-full bg-muted/30" />

  const { L, MapContainer, TileLayer, Marker, Popup, CircleMarker } = modules

  return (
    <MapContainer center={center} zoom={zoom} minZoom={2} maxZoom={18} className="h-full w-full">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OSM" />
      {layers.map((l) => (
        <div key={l.id} className="absolute top-3 left-3 z-20 flex flex-col gap-1 pointer-events-none">
          <span className="text-[10px] font-bold tracking-wider bg-white/90 px-2 py-0.5 rounded shadow-sm uppercase opacity-80">
            {l.name}
          </span>
        </div>
      ))}
      {markers?.map((m, i) => {
        const color = m.color || "#2563eb"
        const icon = L.divIcon({
          className: "rw-marker",
          html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4)"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        })
        return (
          <Marker key={i} position={m.position} icon={icon}>
            <Popup>{m.label}</Popup>
          </Marker>
        )
      })}
      {circles?.map((c, i) => (
        <CircleMarker
          key={i}
          center={c.position}
          radius={c.radius}
          color={c.color}
          fillColor={c.fill}
          fillOpacity={0.35}
          weight={2}
        >
          {c.label && <Popup>{c.label}</Popup>}
        </CircleMarker>
      ))}
    </MapContainer>
  )
}

export default MapView
