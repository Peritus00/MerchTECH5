/**
 * ResponsiveGrid Component
 * Automatically adjusts grid columns based on screen size
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useResponsive } from '@/hooks/useResponsive';

interface ResponsiveGridProps {
  children: React.ReactNode[];
  minItemWidth?: number;
  gap?: number;
  style?: any;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  minItemWidth = 150,
  gap = 12,
  style,
}) => {
  const { getColumns, getCardWidth } = useResponsive();

  const columns = getColumns(minItemWidth);
  const cardWidth = getCardWidth(columns, gap);

  // Split children into rows
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < children.length; i += columns) {
    rows.push(children.slice(i, i + columns));
  }

  return (
    <View style={[styles.container, style]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, { gap }]}>
          {row.map((child, colIndex) => (
            <View key={colIndex} style={[styles.item, { width: cardWidth }]}>
              {child}
            </View>
          ))}
          {/* Fill remaining space if last row is incomplete */}
          {row.length < columns && 
            Array.from({ length: columns - row.length }).map((_, index) => (
              <View key={`filler-${index}`} style={{ width: cardWidth }} />
            ))
          }
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  item: {
    flex: 0,
  },
});

export default ResponsiveGrid;
