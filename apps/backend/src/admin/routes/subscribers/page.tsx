import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { Kpi, PageHeader } from "../../lib/ui"

const MailIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="2.5"
      y="4.5"
      width="15"
      height="11"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <path
      d="m3.5 6 6.5 5 6.5-5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

type Signup = {
  id: string
  email: string
  source: string | null
  confirmed_at: string | null
  marketing_suppressed: boolean
  created_at: string
}

async function fetchSignups(): Promise<Signup[]> {
  const res = await fetch(`/admin/waitlist?limit=5000`, {
    credentials: "include",
  })
  if (!res.ok) throw new Error(`Nem sikerült betölteni (${res.status})`)
  const data = await res.json()
  return data.signups ?? []
}

const SOURCE_HU: Record<string, string> = {
  newsletter: "Hírlevél",
  vanilias: "Vaníliás várólista",
  oszibarackos: "Őszibarackos várólista",
}

function downloadCsv(signups: Signup[]) {
  const rows = [
    ["email", "forras", "datum"],
    ...signups.map((s) => [
      s.email,
      SOURCE_HU[s.source ?? ""] ?? s.source ?? "",
      new Date(s.created_at).toISOString().slice(0, 10),
    ]),
  ]
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n")
  // BOM so Excel opens the Hungarian characters correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `momo-feliratkozok-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const SubscribersPage = () => {
  const { data: signups = [], isLoading, isError } = useQuery({
    queryKey: ["admin-waitlist"],
    queryFn: fetchSignups,
  })

  const newsletter = signups.filter(
    (s) =>
      s.source === "newsletter" &&
      s.confirmed_at &&
      !s.marketing_suppressed
  )
  const newsletterPending = signups.filter(
    (s) => s.source === "newsletter" && !s.confirmed_at
  )
  const waitlist = signups.filter((s) => s.source !== "newsletter")

  return (
    <Container className="flex flex-col gap-y-5 p-0">
      <PageHeader
        title="Feliratkozók"
        subtitle="Hírlevél-feliratkozások és új-íz várólisták — exportálható CSV-be"
        right={
          <Button
            size="small"
            variant="secondary"
            disabled={!newsletter.length}
            onClick={() => downloadCsv(newsletter)}
          >
            Megerősített hírlevél CSV ({newsletter.length})
          </Button>
        }
      />

      {isError && (
        <div className="px-6">
          <Text className="text-ui-fg-error">
            Nem sikerült betölteni a feliratkozókat. Frissítsd az oldalt.
          </Text>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 px-6 md:grid-cols-4">
        <Kpi
          label="Összes rögzített cím"
          value={isLoading ? "…" : String(signups.length)}
        />
        <Kpi
          label="Megerősített hírlevél"
          value={isLoading ? "…" : String(newsletter.length)}
        />
        <Kpi
          label="Megerősítésre vár"
          value={isLoading ? "…" : String(newsletterPending.length)}
        />
        <Kpi
          label="Új-íz várólista"
          value={isLoading ? "…" : String(waitlist.length)}
          hint="Vaníliás / Őszibarackos"
        />
      </div>

      <div className="px-6 pb-6">
        <Container className="p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>E-mail</Table.HeaderCell>
                <Table.HeaderCell>Forrás</Table.HeaderCell>
                <Table.HeaderCell>Státusz</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Dátum</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {isLoading && (
                <Table.Row>
                  <Table.Cell colSpan={4}>Betöltés…</Table.Cell>
                </Table.Row>
              )}
              {!isLoading && signups.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={4}>
                    Még nincs feliratkozó. A lábléces hírlevél-mező és a
                    „Hamarosan" szekció gyűjti őket.
                  </Table.Cell>
                </Table.Row>
              )}
              {signups.map((s) => (
                <Table.Row key={s.id}>
                  <Table.Cell>{s.email}</Table.Cell>
                  <Table.Cell>
                    <Badge
                      size="2xsmall"
                      color={s.source === "newsletter" ? "green" : "purple"}
                    >
                      {SOURCE_HU[s.source ?? ""] ?? s.source ?? "-"}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {s.source === "newsletter" ? (
                      <Badge
                        size="2xsmall"
                        color={
                          s.marketing_suppressed
                            ? "red"
                            : s.confirmed_at
                            ? "green"
                            : "orange"
                        }
                      >
                        {s.marketing_suppressed
                          ? "Leiratkozott"
                          : s.confirmed_at
                          ? "Megerősítve"
                          : "Megerősítésre vár"}
                      </Badge>
                    ) : (
                      <Text size="xsmall" className="text-ui-fg-muted">
                        Várólista
                      </Text>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {new Date(s.created_at).toLocaleDateString("hu-HU")}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Feliratkozók",
  icon: MailIcon,
})

export default SubscribersPage
