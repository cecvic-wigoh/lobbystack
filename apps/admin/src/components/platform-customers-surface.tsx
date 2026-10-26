"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { requestJson } from "@/lib/request-json";
import { PageSurface } from "./page-surface";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Customer = { businessId: string; name: string; timezone: string; status: string; onboardingStage: string };
export function PlatformCustomersSurface() {
  const { t } = useTranslation("admin");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [values, setValues] = useState({ name: "", email: "", timezone: "America/Regina", businessType: "service_company" });
  const customers = useQuery({ queryKey: ["platform-customers", search, offset], queryFn: () => requestJson<{ customers: Customer[]; hasNext: boolean }>(`/api/platform/customers?search=${encodeURIComponent(search)}&offset=${offset}`), retry: false });
  const open = useMutation({ mutationFn: (businessId: string) => requestJson("/api/platform/customers", { method: "PATCH", body: JSON.stringify({ businessId }) }), onSuccess: () => { window.location.assign("/agent"); } });
  const create = useMutation({ mutationFn: () => requestJson<{ businessId: string }>("/api/platform/customers", { method: "POST", body: JSON.stringify(values) }), onSuccess: async () => { setValues({ ...values, name: "", email: "" }); await customers.refetch(); } });
  const error = customers.error ?? open.error ?? create.error;
  return <PageSurface title={t("platform.title")} description={t("platform.description")}>
    <p className="text-muted-foreground">{t("platform.description")}</p>
    {error ? <p role="alert" className="text-destructive">{error.message}</p> : null}
    <Card><CardHeader><CardTitle>{t("platform.createTitle")}</CardTitle><CardDescription>{t("platform.inviteHint")}</CardDescription></CardHeader><CardContent>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); create.mutate(); }}>
        {(["name", "email", "timezone"] as const).map(field => <div key={field} className="space-y-2"><Label htmlFor={`customer-${field}`}>{t(`platform.${field}`)}</Label><Input id={`customer-${field}`} type={field === "email" ? "email" : "text"} required maxLength={field === "email" ? 254 : 160} value={values[field]} onChange={event => setValues({ ...values, [field]: event.target.value })} /></div>)}
        <div><Button type="submit" disabled={create.isPending}>{t(create.isPending ? "platform.saving" : "platform.create")}</Button></div>
        {create.isSuccess ? <p role="status">{t("platform.created")}</p> : null}
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("platform.customers")}</CardTitle><Label htmlFor="customer-search" className="sr-only">{t("platform.search")}</Label><Input id="customer-search" placeholder={t("platform.search")} value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></CardHeader><CardContent>
      {customers.isLoading ? <p role="status">{t("platform.loading")}</p> : <Table><TableHeader><TableRow>{["name", "timezone", "status", "onboarding", "actions"].map(key => <TableHead key={key}>{t(`platform.${key}`)}</TableHead>)}</TableRow></TableHeader><TableBody>
        {(customers.data?.customers ?? []).map(customer => <TableRow key={customer.businessId}><TableCell>{customer.name}</TableCell><TableCell>{customer.timezone}</TableCell><TableCell>{t(customer.status === "active" ? "platform.active" : "platform.inactive")}</TableCell><TableCell>{t(customer.onboardingStage === "complete" ? "platform.ready" : "platform.setupNeeded")}</TableCell><TableCell><Button variant="outline" disabled={open.isPending} onClick={() => open.mutate(customer.businessId)}>{t("platform.open")}</Button></TableCell></TableRow>)}
        {customers.data?.customers.length === 0 ? <TableRow><TableCell colSpan={5}>{t("platform.empty")}</TableCell></TableRow> : null}
      </TableBody></Table>}
      <div className="mt-4 flex gap-2"><Button variant="outline" disabled={offset === 0 || customers.isFetching} onClick={() => setOffset(Math.max(0, offset - 50))}>{t("platform.previous")}</Button><Button variant="outline" disabled={!customers.data?.hasNext || customers.isFetching} onClick={() => setOffset(offset + 50)}>{t("platform.next")}</Button></div>
      <p className="mt-4 text-sm text-muted-foreground">{t("platform.openHint")}</p>
    </CardContent></Card>
  </PageSurface>;
}
