"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { requestJson } from "@/lib/request-json";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Administrator = { id: string; email: string; name: string | null };
export function PlatformAdministrators() {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [removing, setRemoving] = useState<Administrator | null>(null);
  const admins = useQuery({ queryKey: ["platform-admins"], queryFn: () => requestJson<{ admins: Administrator[]; currentUserId: string }>("/api/platform/admins"), retry: false });
  const save = useMutation({
    mutationFn: (input: { email: string; enabled: boolean }) => requestJson("/api/platform/admins", { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: async (_data, input) => {
      if (input.enabled) setEmail("");
      const self = admins.data?.admins.find(admin => admin.id === admins.data?.currentUserId);
      if (!input.enabled && input.email === self?.email) { window.location.assign("/"); return; }
      await queryClient.invalidateQueries({ queryKey: ["platform-admins"] });
    },
  });
  const error = save.error ?? admins.error;
  return <Card id="platform-administrators"><CardHeader><CardTitle>{t("administrators.title")}</CardTitle><CardDescription>{t("administrators.description")}</CardDescription></CardHeader><CardContent className="space-y-4">
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); save.mutate({ email: email.trim(), enabled: true }); }}>
      <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="platform-admin-email">{t("administrators.email")}</Label><Input id="platform-admin-email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={save.isPending} /></div>
      <Button type="submit" disabled={save.isPending || admins.isLoading || Boolean(admins.error)}>{t(save.isPending ? "administrators.saving" : "administrators.add")}</Button>
    </form>
    <p className="text-sm text-muted-foreground">{t("administrators.accountHint")}</p>
    {error ? <p role="alert" className="text-destructive">{error.message}</p> : null}
    {save.isSuccess ? <p role="status">{t("administrators.saved")}</p> : null}
    {admins.isLoading ? <p role="status">{t("administrators.loading")}</p> : <Table><TableHeader><TableRow><TableHead>{t("administrators.email")}</TableHead><TableHead>{t("administrators.actions")}</TableHead></TableRow></TableHeader><TableBody>
      {(admins.data?.admins ?? []).map(admin => <TableRow key={admin.id}><TableCell>{admin.email} {admin.id === admins.data?.currentUserId ? <Badge variant="secondary">{t("administrators.you")}</Badge> : null}</TableCell><TableCell><Button variant="outline" disabled={save.isPending || admins.data!.admins.length <= 1} onClick={() => { save.reset(); setRemoving(admin); }}>{t("administrators.remove")}</Button></TableCell></TableRow>)}
    </TableBody></Table>}
    <p className="text-sm text-muted-foreground">{t("administrators.lastAdminHint")}</p>
    <ConfirmDeleteDialog open={Boolean(removing)} onOpenChange={open => { if (!open) setRemoving(null); }} title={t("administrators.removeTitle")} description={save.error ? save.error.message : t("administrators.removeDescription", { email: removing?.email })} cancelLabel={t("administrators.cancel")} confirmLabel={t("administrators.remove")} pending={save.isPending} onConfirm={async () => { if (removing) await save.mutateAsync({ email: removing.email, enabled: false }); }} />
  </CardContent></Card>;
}
