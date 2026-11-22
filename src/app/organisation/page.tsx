"use client"

import { useState } from "react"
import { Users, Shield, Lock, Mail, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
import { t } from "@/lib/i18n"
import { Select, SelectTrigger, SelectContent, SelectValue, SelectItem } from "@/components/ui/select"

const ROLES = [
  { id: "field_scout", label: "Field Scout / Observatory User", level: "Viewer" },
  { id: "epidemiologist", label: "Epidemiologist / Modeler", level: "Editor" },
  { id: "policy_maker", label: "Policy Decision-Maker", level: "Owner" },
] as const

const MEMBERS = [
  { id: "m1", name: "Amina Diallo", email: "amina@wave.org", role: "epidemiologist", level: "Editor", avatar: "AD" },
  { id: "m2", name: "Kwame Nkrumah", email: "kwame@wave.org", role: "field_scout", level: "Viewer", avatar: "KN" },
  { id: "m3", name: "Sarah Jallow", email: "sarah@wave.org", role: "policy_maker", level: "Owner", avatar: "SJ" },
]

export default function OrganisationPage() {
  const [open, setOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState("field_scout")

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organisation</h1>
          <p className="text-muted-foreground text-sm">Credential-based access control, members, and permissions.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users size={14} /> Organisation members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-center">Role</TableHead>
                      <TableHead className="text-center">Permission level</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MEMBERS.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">{m.avatar}</div>
                          <span className="text-sm font-medium">{m.name}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                        <TableCell className="text-center text-sm">
                          <Badge variant="outline">{m.role.replace("_", " ").toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <Badge variant={m.level === "Owner" ? "destructive" : m.level === "Editor" ? "default" : "secondary"}>
                            {m.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="text-muted-foreground">
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="w-full">
                <Plus size={14} /> Add member
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield size={14} /> Permissions model
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">Each dashboard carries org-level and per-dashboard credentials.</div>
              <div className="space-y-2">
                {ROLES.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded border bg-background/50">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center text-xs">{r.id[0].toUpperCase()}</div>
                      <div>
                        <div className="text-sm font-medium">{r.label}</div>
                        <div className="text-xs text-muted-foreground">{r.level} access</div>
                      </div>
                    </div>
                    <Badge variant="outline">{r.level}</Badge>
                  </div>
                ))}
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Roles: <b>Field Scout</b> (viewer), <b>Epidemiologist</b> (editor), <b>Policy Decision-Maker</b> (owner). Permissions are enforced on every dashboard and file action.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Organisation settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Require MFA for editors</span>
                <Toggle defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Public dashboard sharing</span>
                <Toggle defaultChecked={false} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Email alerts on new posterior</span>
                <Toggle defaultChecked />
              </div>
            </CardContent>
          </Card>

          {open && (
            <Card className="animate-in fade-in zoom-in duration-200">
              <CardHeader>
                <CardTitle className="text-sm">Add member</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                <Input placeholder="Email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <Select value={newRole} onValueChange={setNewRole}>
                  {ROLES.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                  ))}
                </Select>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button size="sm" disabled={!newEmail}>Invite</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
