// Numbers drawn as dots, like a dot matrix display: the clock on Home, the hours figures, a time in its box. Each character is a grid of five by seven,
// and only the lit dots are drawn. It is plain views, so it needs no font and no native package. What it cannot draw (a word) is left to ordinary text:
// ask `dotsCan` first. A screen reader is given the text itself.
import { memo } from 'react';
import { View } from 'react-native';

const G: Record<string, string[]> = {
  '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.', '.', '#', '.', '#', '.', '.'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ' ': ['..', '..', '..', '..', '..', '..', '..'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '–': ['....', '....', '....', '####', '....', '....', '....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  'h': ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  'm': ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  'd': ['....#', '....#', '.##.#', '#..##', '#...#', '#...#', '.####'],
};

export const dotsCan = (text: string) => text.length > 0 && [...text].every(c => c in G);

// `size` is the height of a character. The dots are round and sit a little apart.
export const Dots = memo(function Dots({ text, size, color, align = 'left' }: { text: string; size: number; color: string; align?: 'left' | 'center' }) {
  const pitch = size / 7, dot = pitch * 0.78;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={text} style={{ flexDirection: 'row', height: size, ...(align === 'center' ? { alignSelf: 'center' as const } : null) }}>
      {[...text].map((c, i) => {
        const g = G[c] || G[' '], cols = g[0].length;
        return (
          <View key={i} importantForAccessibility="no-hide-descendants" style={{ width: cols * pitch, height: size, marginRight: i < text.length - 1 ? pitch * 0.9 : 0 }}>
            {g.flatMap((line, y) => [...line].map((on, x) => on === '#'
              ? <View key={`${x}:${y}`} style={{ position: 'absolute', left: x * pitch, top: y * pitch, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }} />
              : null))}
          </View>
        );
      })}
    </View>
  );
});
