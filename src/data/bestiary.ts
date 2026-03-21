import { Monster } from '../types';
import bestiary2014 from './bestiary-2014.json';
import bestiary2024 from './bestiary-2024.json';

function tokenSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+$/, '');
}

function withAvatar(monsters: Monster[]): Monster[] {
  return monsters.map(m => ({
    ...m,
    avatar: `/tokens/${tokenSlug(m.name)}.jpg`,
  }));
}

export const BESTIARY: Monster[] = [
  ...withAvatar(bestiary2014 as Monster[]),
  ...withAvatar(bestiary2024 as Monster[]),
];
