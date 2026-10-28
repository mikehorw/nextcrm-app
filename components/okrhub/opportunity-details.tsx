// OKR Hub fork (OKR-170): read-only display of the OKR Hub opportunity fields
// on the opportunity detail page. Server-safe (no hooks).

import { Briefcase, CalendarCheck, CalendarX, Layers, Receipt, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Props = {
  brand?: string | null;
  service_lines?: string[] | null;
  value_types?: string[] | null;
  lost_reason?: string | null;
  won_at?: Date | string | null;
  lost_at?: Date | string | null;
};

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const Row = ({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="-mx-2 flex items-start space-x-4 rounded-md p-2 transition-all hover:bg-accent hover:text-accent-foreground">
    <Icon className="mt-px h-5 w-5" />
    <div className="space-y-1">
      <p className="text-sm font-medium leading-none">{label}</p>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  </div>
);

const Badges = ({ values }: { values?: string[] | null }) =>
  values && values.length ? (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <Badge key={v} variant="secondary" className="rounded-sm px-1 font-normal">
          {v}
        </Badge>
      ))}
    </div>
  ) : (
    <>N/A</>
  );

export function OkrhubOpportunityDetails(props: Props) {
  return (
    <>
      <Row icon={Briefcase} label="Brand">
        {props.brand || "N/A"}
      </Row>
      <Row icon={Layers} label="Service line">
        <Badges values={props.service_lines} />
      </Row>
      <Row icon={Receipt} label="Value type">
        <Badges values={props.value_types} />
      </Row>
      {props.won_at && (
        <Row icon={CalendarCheck} label="Won on">
          {fmtDate(props.won_at)}
        </Row>
      )}
      {props.lost_at && (
        <Row icon={CalendarX} label="Lost on">
          {fmtDate(props.lost_at)}
        </Row>
      )}
      {props.lost_reason && (
        <Row icon={XCircle} label="Lost reason">
          {props.lost_reason}
        </Row>
      )}
    </>
  );
}
