import { Combatant, ClassDefinition } from '../types';

export async function fetchDnDBeyondCharacter(idOrUrl: string): Promise<Partial<Combatant> | null> {
  try {
    let characterId = idOrUrl.trim();
    
    // Handle campaign URLs
    if (characterId.includes('/campaigns/')) {
      throw new Error('CAMPAIGN_URL');
    }

    // Use regex to find the numeric ID in the URL
    // This handles URLs like .../characters/12345678/builder or .../characters/12345678?preview=true
    const idMatch = characterId.match(/\/characters\/(\d+)/) || characterId.match(/^(\d+)$/);
    
    if (idMatch) {
      characterId = idMatch[1];
    } else {
      // Fallback: try to get the last numeric part
      const parts = characterId.split('/').filter(p => p && !isNaN(Number(p)));
      if (parts.length > 0) {
        characterId = parts[parts.length - 1];
      } else {
        return null;
      }
    }

    // Using our local server-side proxy to bypass CORS and "Load failed" issues
    const response = await fetch(`/api/proxy/dndbeyond-character/${characterId}`);
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        throw new Error('CHARACTER_PRIVATE');
      }
      throw new Error('FETCH_FAILED');
    }
    
    const json = await response.json();
    
    if (json.success === false || !json.data) {
      // D&D Beyond returns success: false for private characters
      throw new Error('CHARACTER_PRIVATE');
    }

    const data = json.data;

    // Calculate HP
    const baseHp = data.baseHitPoints || 0;
    const bonusHp = data.bonusHitPoints || 0;
    const removedHp = data.removedHitPoints || 0;
    const overrideHp = data.overrideHitPoints || 0;
    
    // D&D Beyond HP logic is complex, this is a reasonable approximation
    const maxHp = overrideHp || (baseHp + bonusHp);
    const currentHp = maxHp - removedHp;

    // Map Classes
    const classes: ClassDefinition[] = data.classes.map((c: any) => ({
      name: c.definition.name,
      level: c.level,
      subclass: c.subclassDefinition?.name
    }));

    // Basic Stats
    const stats = data.stats.reduce((acc: any, s: any) => {
      acc[s.id] = s.value;
      return acc;
    }, {});

    // Dex Modifier (id 2 is Dex)
    const dex = stats[2] || 10;
    const dexMod = Math.floor((dex - 10) / 2);

    // Initiative calculation
    let initiativeBonus = dexMod;
    // Check for "Alert" feat or other initiative bonuses in modifiers
    const initModifiers = data.modifiers?.race?.filter((m: any) => m.subType === 'initiative') || [];
    initModifiers.forEach((m: any) => {
      initiativeBonus += (m.value || 0);
    });

    // AC Calculation (Simplified)
    let ac = 10 + dexMod;
    
    // Speed
    const speed = data.baseSpeed || 30;

    return {
      name: data.name,
      hp: currentHp,
      maxHp: maxHp,
      ac: ac,
      species: data.race?.fullName || 'Unknown',
      speed: speed,
      darkvision: 60, 
      classes: classes,
      initiative: initiativeBonus,
      type: 'player',
      dndBeyondId: characterId
    };
  } catch (error) {
    console.error('Error fetching D&D Beyond character:', error);
    throw error; // Re-throw so the UI can catch it
  }
}
