import { Monster } from '../types';
import bestiary2014 from './bestiary-2014.json';
import bestiary2024 from './bestiary-2024.json';

export const BESTIARY: Monster[] = [
  ...(bestiary2014 as Monster[]),
  ...(bestiary2024 as Monster[]),
];
