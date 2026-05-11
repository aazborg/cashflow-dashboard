"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface PerMitSeriesPoint {
  monthLabel: string;
  /** key: mitarbeiter_id, value: € im Monat */
  [mitId: string]: string | number;
}

interface MitDescriptor {
  id: string;
  name: string;
  color: string;
}

interface Props {
  data: PerMitSeriesPoint[];
  mitarbeiter: MitDescriptor[];
  /** Index des aktuellen Monats, an dem die orange "heute"-Linie gezeichnet wird. */
  nowIndex?: number;
}

export default function PerMitarbeiterCashflowChart({
  data,
  mitarbeiter,
  nowIndex,
}: Props) {
  const showNowLine =
    typeof nowIndex === "number" && nowIndex >= 0 && nowIndex < data.length;
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#eae9e4" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="monthLabel"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#eae9e4" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) =>
              new Intl.NumberFormat("de-AT", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(v)
            }
          />
          <Tooltip
            formatter={(value, name) => [
              new Intl.NumberFormat("de-AT", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              }).format(typeof value === "number" ? value : Number(value) || 0),
              name,
            ]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #eae9e4",
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="line"
          />
          {showNowLine ? (
            <ReferenceLine
              x={data[nowIndex!].monthLabel}
              stroke="#f28a26"
              strokeDasharray="3 3"
              label={{
                value: "heute",
                position: "top",
                fill: "#f28a26",
                fontSize: 11,
              }}
            />
          ) : null}
          {mitarbeiter.map((m) => (
            <Line
              key={m.id}
              type="monotone"
              dataKey={m.id}
              name={m.name}
              stroke={m.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
