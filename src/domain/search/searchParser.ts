import type { SearchIntent, SearchMode, TransactionIntent, ProjectStageOrStatus, PropertyType } from './searchIntent';

function parseIndianAmount(amountStr: string, unitStr: string): number {
  const num = parseFloat(amountStr);
  if (isNaN(num) || num <= 0) return 0;
  const unit = (unitStr || '').toLowerCase().trim();
  if (unit.startsWith('cr')) {
    return Math.round(num * 10000000);
  }
  if (unit.startsWith('l') || unit.startsWith('lac')) {
    return Math.round(num * 100000);
  }
  return Math.round(num);
}

export class SearchParser {
  /**
   * Normalizes raw search query strings
   */
  normalizeQuery(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .toLowerCase()
      .trim()
      .replace(/[\s]+/g, ' ')
      .replace(/[\–\—]/g, '-')
      .replace(/[^a-z0-9\s\-₹.,+]/g, '');
  }

  /**
   * Parses raw query string into a structured SearchIntent
   */
  parse(rawQuery: string, defaultMode: SearchMode = 'ALL'): SearchIntent {
    const raw = rawQuery || '';
    const normalized = this.normalizeQuery(raw);
    const tokens = normalized.split(' ').filter(Boolean);

    const intent: SearchIntent = {
      rawQuery: raw,
      normalizedQuery: normalized,
      mode: defaultMode,
      entityTypes: ['PROJECT', 'LOCATION', 'DEVELOPER', 'RESALE', 'RENTAL'],
      transactionIntent: 'UNKNOWN',
      locationIds: [],
      bhk: [],
      propertyTypes: [],
      projectStages: [],
      searchTokens: tokens,
      confidence: 'MEDIUM',
      parsedTerms: {},
      unresolvedTerms: [],
    };

    if (!normalized) {
      intent.confidence = 'LOW';
      return intent;
    }

    // 1. Transaction Intent & Mode Inference
    // Explicit mode takes precedence over inferred mode
    if (
      /\b(buy|sale|resale|for sale|purchase|buying)\b/.test(normalized)
    ) {
      intent.transactionIntent = 'BUY';
      if (defaultMode === 'ALL') {
        intent.mode = 'BUY';
      }
    } else if (
      /\b(rent|rental|lease|for rent|renting)\b/.test(normalized)
    ) {
      intent.transactionIntent = 'RENT';
      if (defaultMode === 'ALL') {
        intent.mode = 'RENT';
      }
    } else if (
      /\b(project|projects|new launch|upcoming|under construction|ready to move|ready flats)\b/.test(normalized)
    ) {
      intent.transactionIntent = 'PROJECT_DISCOVERY';
      if (defaultMode === 'ALL') {
        intent.mode = 'PROJECTS';
      }
    }

    // 2. BHK Intelligence
    // Distinguish "3 BHK" from "3 towers" or "3 floors" or "3 acres"
    const multiBhkMatch = normalized.match(/\b([1-5])\s*(?:and|&|or|,|\/)\s*([1-5])\s*(?:bhk|bed|bedroom)\b/);
    if (multiBhkMatch) {
      intent.bhk = [parseInt(multiBhkMatch[1], 10), parseInt(multiBhkMatch[2], 10)].sort((a, b) => a - b);
      intent.parsedTerms.bhk = intent.bhk;
    } else {
      const bhkMatches = normalized.match(/\b([1-5])\s*(?:bhk|bed|bedroom)\b/g);
      if (bhkMatches) {
        const bhks = bhkMatches.map((m) => {
          const num = m.match(/[1-5]/);
          return num ? parseInt(num[0], 10) : null;
        }).filter((n): n is number => n !== null);
        intent.bhk = Array.from(new Set(bhks));
        intent.parsedTerms.bhk = intent.bhk;
      } else if (/\b(three|four|five|one|two)\s*(?:bhk|bed|bedroom)\b/.test(normalized)) {
        if (/one/.test(normalized)) intent.bhk.push(1);
        if (/two/.test(normalized)) intent.bhk.push(2);
        if (/three/.test(normalized)) intent.bhk.push(3);
        if (/four/.test(normalized)) intent.bhk.push(4);
        if (/five/.test(normalized)) intent.bhk.push(5);
        intent.parsedTerms.bhk = intent.bhk;
      }
    }

    if (/\b3\+\s*bhk\b/.test(normalized) || /\b3\s*bhk\s*(?:and above|plus|\+)\b/.test(normalized)) {
      intent.bhkMin = 3;
      intent.parsedTerms.bhkMin = 3;
    }

    // 3. Project Stage / Status
    if (/\b(new\s*launch)\b/.test(normalized)) {
      intent.projectStages.push('NEW LAUNCH');
    }
    if (/\b(upcoming)\b/.test(normalized)) {
      intent.projectStages.push('UPCOMING');
    }
    if (/\b(under\s*construction)\b/.test(normalized)) {
      intent.projectStages.push('UNDER CONSTRUCTION');
    }
    if (/\b(ready\s*to\s*move|ready\s*flats)\b/.test(normalized)) {
      intent.projectStages.push('READY TO MOVE');
    }

    // 4. Property Types
    if (/\b(flat|flats|apartment|apartments)\b/.test(normalized)) {
      intent.propertyTypes.push('APARTMENT', 'FLAT');
    }
    if (/\b(villa|villas)\b/.test(normalized)) {
      intent.propertyTypes.push('VILLA');
    }
    if (/\b(independent\s*house|house|independent)\b/.test(normalized)) {
      intent.propertyTypes.push('INDEPENDENT_HOUSE');
    }
    if (/\b(plot|plots|land)\b/.test(normalized)) {
      intent.propertyTypes.push('PLOT');
    }
    if (/\b(duplex)\b/.test(normalized)) {
      intent.propertyTypes.push('DUPLEX');
    }
    if (/\b(penthouse|penthouses)\b/.test(normalized)) {
      intent.propertyTypes.push('PENTHOUSE');
    }

    // 5. Budget Intelligence (Indian Currency & Money Ranges)
    // Range: "between 80 lakh and 1.2 cr", "80 lakh to 1.2 cr", "80l to 1.2 cr"
    const rangeMatch = normalized.match(
      /(?:between\s+)?(?:₹\s*)?([0-9.]+)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|l)\s*(?:and|to|-)\s*(?:₹\s*)?([0-9.]+)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|l)\b/i
    );

    if (rangeMatch) {
      const minVal = parseIndianAmount(rangeMatch[1], rangeMatch[2]);
      const maxVal = parseIndianAmount(rangeMatch[3], rangeMatch[4]);
      if (minVal > 0 && maxVal > 0) {
        intent.budgetMin = Math.min(minVal, maxVal);
        intent.budgetMax = Math.max(minVal, maxVal);
        intent.parsedTerms.budgetMin = intent.budgetMin;
        intent.parsedTerms.budgetMax = intent.budgetMax;
      }
    } else {
      // Standalone or max/min expressions
      // Example: "under 1 cr", "below 1.5 crore", "80 lakh", "80L", "₹80 lakh", "0.8 crore", "100 lakh"
      const maxMatch = normalized.match(
        /(?:under|below|upto|less than|within|max(?:imum)?)\s*(?:₹\s*)?([0-9.]+)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|l)\b/i
      );
      const minMatch = normalized.match(
        /(?:above|over|more than|min(?:imum)?)\s*(?:₹\s*)?([0-9.]+)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|l)\b/i
      );
      const standaloneMatch = normalized.match(
        /(?:₹\s*)?([0-9.]+)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|l)\b/i
      );

      if (maxMatch) {
        intent.budgetMax = parseIndianAmount(maxMatch[1], maxMatch[2]);
        intent.parsedTerms.budgetMax = intent.budgetMax;
      } else if (minMatch) {
        intent.budgetMin = parseIndianAmount(minMatch[1], minMatch[2]);
        intent.parsedTerms.budgetMin = intent.budgetMin;
      } else if (standaloneMatch) {
        const val = parseIndianAmount(standaloneMatch[1], standaloneMatch[2]);
        if (val > 0) {
          intent.budgetMax = val;
          intent.parsedTerms.budgetMax = val;
        }
      }
    }

    // 6. Entity Specific Extraction & Typo Corrections
    // Check Developer
    if (/\bmerlin\b/.test(normalized)) {
      intent.developerQuery = 'Merlin';
    }

    // Check Location & Aliases
    if (/\brajarhat\b/.test(normalized)) {
      intent.locationQuery = 'Rajarhat';
    } else if (/\b(new\s*town|newtown|newtowm)\b/.test(normalized)) {
      // "Newtowm" typo resolves to canonical "New Town"
      intent.locationQuery = 'New Town';
    } else if (/\bsalt\s*lake\b/.test(normalized)) {
      intent.locationQuery = 'Salt Lake';
    } else if (/\bkolkata\b/.test(normalized)) {
      intent.locationQuery = 'Kolkata';
    } else if (/\b(sector\s*v|sector\s*5)\b/.test(normalized)) {
      intent.locationQuery = 'Sector V';
    } else if (/\baction\s*area\s*1\b/.test(normalized)) {
      intent.locationQuery = 'Action Area 1';
    } else if (/\baction\s*area\s*2\b/.test(normalized)) {
      intent.locationQuery = 'Action Area 2';
    } else if (/\baction\s*area\s*3\b/.test(normalized)) {
      intent.locationQuery = 'Action Area 3';
    }

    // Check Project & Typo corrections
    if (/\bmerlin\s*(?:rise|rize)\b/.test(normalized)) {
      // "Merlin Rize" typo resolves to canonical "Merlin Rise"
      intent.projectQuery = 'Merlin Rise';
      intent.confidence = 'HIGH';
    } else if (/\bmerlin\s*the\s*fourth\b/.test(normalized)) {
      intent.projectQuery = 'Merlin The Fourth';
      intent.confidence = 'HIGH';
    } else if (/\bmerlin\s*elements\b/.test(normalized)) {
      intent.projectQuery = 'Merlin Elements';
      intent.confidence = 'HIGH';
    } else if (/\bps\s*one10\b/.test(normalized)) {
      intent.projectQuery = 'PS One10';
      intent.confidence = 'HIGH';
    }

    return intent;
  }
}

export const searchParser = new SearchParser();
