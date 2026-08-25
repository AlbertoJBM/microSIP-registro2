// dashboard/src/components/CallTypePieChart.tsx
import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = {
  incoming: '#4CAF50',
  outgoing: '#2196F3',
  missed: '#FF5252'
};

interface CallTypePieChartProps {
  data: {
    incoming_calls: number;
    outgoing_calls: number;
    missed_calls: number;
  };
}

export const CallTypePieChart: React.FC<CallTypePieChartProps> = ({ data }) => {
  const chartData = [
    { name: 'Entrantes', value: data.incoming_calls || 0 },
    { name: 'Salientes', value: data.outgoing_calls || 0 },
    { name: 'Perdidas', value: data.missed_calls || 0 }
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          fill="#8884d8"
          paddingAngle={5}
          dataKey="value"
          label={(entry) => `${entry.name}: ${entry.value}`}
        >
          <Cell fill={COLORS.incoming} />
          <Cell fill={COLORS.outgoing} />
          <Cell fill={COLORS.missed} />
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};