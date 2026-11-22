"use client"

import { useState } from "react"
import { Upload, FileText, Image, Database, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { t } from "@/lib/i18n"

export default function FilesPage() {
  const [files] = useState([
    { id: "f1", name: "field_survey_q3_2024.csv", type: "csv", size: "1.2 MB", version: 3, validated: true, org: "org_wave_001" },
    { id: "f2", name: "delimitation_surveys.geojson", type: "geojson", size: "840 KB", version: 2, validated: true, org: "org_wave_001" },
    { id: "f3", name: "host_crop_raster.tif", type: "raster", size: "45 MB", version: 1, validated: true, org: "org_wave_001" },
    { id: "f4", name: "abc_smc_posterior_v2.json", type: "posterior", size: "2.1 MB", version: 2, validated: true, org: "org_wave_001" },
    { id: "f5", name: "stan_model_cbsd.stan", type: "stan", size: "15 KB", version: 1, validated: false, org: "org_wave_001" },
  ])

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Files Manager</h1>
          <p className="text-muted-foreground text-sm">Upload, validate, and version field survey CSVs, GeoJSONs, rasters, and ABC-SMC/Stan artifacts.</p>
        </div>
        <Button className="flex items-center gap-2">
          <Upload size={16} /> {t("en", "upload")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">File registry & version history</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="text-center">Version</TableHead>
                  <TableHead className="text-center">Validated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="flex items-center gap-2">
                      <div className={`rounded p-1.5 ${f.type === "csv" ? "bg-blue/10 text-blue" : f.type === "geojson" ? "bg-green/10 text-green" : f.type === "raster" ? "bg-purple/10 text-purple" : "bg-gray/10 text-gray"}`}>
                        {f.type === "csv" ? <FileText size={14} /> : f.type === "geojson" ? <Image size={14} /> : f.type === "raster" ? <Database size={14} /> : <ShieldCheck size={14} />}
                      </div>
                      <span className="text-sm font-medium">{f.name}</span>
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">{f.type}</TableCell>
                    <TableCell className="text-right text-sm">{f.size}</TableCell>
                    <TableCell className="text-center text-sm">{f.version}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={f.validated ? "default" : "outline"}>{f.validated ? t("en", "statusActive") : t("en", "statusDraft")}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Validate</Button>
                      <Button variant="ghost" size="sm">v{f.version - 1}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Supported artifact types</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><FileText size={14} /> Field survey CSV</div>
          <div className="flex items-center gap-2"><Image size={14} /> GeoJSON vector</div>
          <div className="flex items-center gap-2"><Database size={14} /> Crop raster (GeoTIFF)</div>
          <div className="flex items-center gap-2"><ShieldCheck size={14} /> ABC-SMC / Stan posterior</div>
        </CardContent>
      </Card>
    </div>
  )
}
