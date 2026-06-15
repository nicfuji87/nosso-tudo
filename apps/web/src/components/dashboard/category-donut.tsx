"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

export interface DonutDatum {
  nome: string;
  valor: number;
  cor: string;
}

export function CategoryDonut({ data }: { data: DonutDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={176}>
      <PieChart>
        <Pie
          data={data}
          dataKey="valor"
          nameKey="nome"
          innerRadius={56}
          outerRadius={82}
          paddingAngle={data.length > 1 ? 2 : 0}
          stroke="none"
          startAngle={90}
          endAngle={-270}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.cor || "#8FA993"} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
