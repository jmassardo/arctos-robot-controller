const { logger } = require('./logger');

/**
 * Macro Library with built-in macro definitions
 * Provides a comprehensive set of common manufacturing operations
 */
class MacroLibrary {
  constructor() {
    this.categories = new Map();
    this.initializeLibrary();
  }

  /**
   * Get all macro categories
   * @returns {Array} Array of categories with macros
   */
  getCategories() {
    return Array.from(this.categories.entries()).map(([name, category]) => ({
      name,
      description: category.description,
      macros: category.macros,
    }));
  }

  /**
   * Get macros by category
   * @param {string} categoryName - Category name
   * @returns {Array} Array of macros in category
   */
  getMacrosByCategory(categoryName) {
    const category = this.categories.get(categoryName.toLowerCase());
    return category ? category.macros : [];
  }

  /**
   * Get macro by name
   * @param {string} name - Macro name
   * @returns {Object|null} Macro definition
   */
  getMacro(name) {
    for (const category of this.categories.values()) {
      const macro = category.macros.find(m => m.name.toLowerCase() === name.toLowerCase());
      if (macro) {
        return macro;
      }
    }
    return null;
  }

  /**
   * Search macros by keyword
   * @param {string} keyword - Search keyword
   * @returns {Array} Matching macros
   */
  searchMacros(keyword) {
    const results = [];
    const searchTerm = keyword.toLowerCase();

    for (const category of this.categories.values()) {
      for (const macro of category.macros) {
        if (
          macro.name.toLowerCase().includes(searchTerm) ||
          macro.description.toLowerCase().includes(searchTerm) ||
          macro.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        ) {
          results.push({
            ...macro,
            category: category.name,
          });
        }
      }
    }

    return results;
  }

  /**
   * Initialize the built-in macro library
   */
  initializeLibrary() {
    // Basic Operations
    this.addCategory('basic', 'Basic Operations', [
      {
        name: 'SAFE_MOVE',
        description: 'Move to position with safe Z clearance',
        parameters: [
          { name: 'X', type: 'number', defaultValue: 0, description: 'Target X position' },
          { name: 'Y', type: 'number', defaultValue: 0, description: 'Target Y position' },
          { name: 'Z_SAFE', type: 'number', defaultValue: 5, description: 'Safe Z height' },
        ],
        body: `G00 Z#Z_SAFE
G00 X#X Y#Y
G00 Z0`,
        tags: ['movement', 'safety', 'positioning'],
        version: '1.0',
      },
      {
        name: 'SET_WORK_ORIGIN',
        description: 'Set work coordinate system origin',
        parameters: [
          {
            name: 'WCS',
            type: 'number',
            defaultValue: 54,
            description: 'Work coordinate system (54-59)',
          },
          { name: 'X', type: 'number', defaultValue: 0, description: 'X offset' },
          { name: 'Y', type: 'number', defaultValue: 0, description: 'Y offset' },
          { name: 'Z', type: 'number', defaultValue: 0, description: 'Z offset' },
        ],
        body: `G10 L2 P#WCS-53 X#X Y#Y Z#Z
G#WCS`,
        tags: ['setup', 'coordinates', 'origin'],
        version: '1.0',
      },
    ]);

    // Drilling Operations
    this.addCategory('drilling', 'Drilling Operations', [
      {
        name: 'DRILL_HOLE',
        description: 'Drill a single hole with peck drilling option',
        parameters: [
          { name: 'X', type: 'number', defaultValue: 0, description: 'X position' },
          { name: 'Y', type: 'number', defaultValue: 0, description: 'Y position' },
          { name: 'DEPTH', type: 'number', defaultValue: 5, description: 'Total depth' },
          { name: 'FEED', type: 'number', defaultValue: 100, description: 'Feed rate' },
          {
            name: 'PECK',
            type: 'number',
            defaultValue: 0,
            description: 'Peck depth (0 = no pecking)',
          },
          { name: 'Z_SAFE', type: 'number', defaultValue: 2, description: 'Safe Z height' },
        ],
        body: `G00 X#X Y#Y
G00 Z#Z_SAFE
IF #PECK > 0
  #CURRENT_DEPTH = 0
  WHILE #CURRENT_DEPTH < #DEPTH
    #PECK_DEPTH = #CURRENT_DEPTH + #PECK
    IF #PECK_DEPTH > #DEPTH
      #PECK_DEPTH = #DEPTH
    ENDIF
    G01 Z-#PECK_DEPTH F#FEED
    G00 Z#Z_SAFE
    #CURRENT_DEPTH = #PECK_DEPTH
  ENDWHILE
ELSE
  G01 Z-#DEPTH F#FEED
  G00 Z#Z_SAFE
ENDIF`,
        tags: ['drilling', 'holes', 'peck'],
        version: '1.1',
      },
      {
        name: 'BOLT_CIRCLE',
        description: 'Drill holes in a circular pattern',
        parameters: [
          { name: 'X_CENTER', type: 'number', defaultValue: 0, description: 'Circle center X' },
          { name: 'Y_CENTER', type: 'number', defaultValue: 0, description: 'Circle center Y' },
          { name: 'RADIUS', type: 'number', defaultValue: 10, description: 'Circle radius' },
          { name: 'NUM_HOLES', type: 'number', defaultValue: 4, description: 'Number of holes' },
          {
            name: 'START_ANGLE',
            type: 'number',
            defaultValue: 0,
            description: 'Starting angle (degrees)',
          },
          { name: 'DEPTH', type: 'number', defaultValue: 5, description: 'Drill depth' },
          { name: 'FEED', type: 'number', defaultValue: 100, description: 'Feed rate' },
        ],
        body: `#ANGLE_INCREMENT = 360 / #NUM_HOLES
#CURRENT_HOLE = 0
WHILE #CURRENT_HOLE < #NUM_HOLES
  #ANGLE = #START_ANGLE + #CURRENT_HOLE * #ANGLE_INCREMENT
  #ANGLE_RAD = #ANGLE * 3.14159 / 180
  #X_POS = #X_CENTER + #RADIUS * cos(#ANGLE_RAD)
  #Y_POS = #Y_CENTER + #RADIUS * sin(#ANGLE_RAD)
  %CALL DRILL_HOLE(#X_POS, #Y_POS, #DEPTH, #FEED)
  #CURRENT_HOLE = #CURRENT_HOLE + 1
ENDWHILE`,
        tags: ['drilling', 'pattern', 'circular'],
        version: '1.0',
      },
    ]);

    // Milling Operations
    this.addCategory('milling', 'Milling Operations', [
      {
        name: 'CUT_RECTANGLE',
        description: 'Cut a rectangular outline or pocket',
        parameters: [
          { name: 'X_START', type: 'number', defaultValue: 0, description: 'Start X position' },
          { name: 'Y_START', type: 'number', defaultValue: 0, description: 'Start Y position' },
          { name: 'WIDTH', type: 'number', defaultValue: 10, description: 'Rectangle width' },
          { name: 'HEIGHT', type: 'number', defaultValue: 10, description: 'Rectangle height' },
          { name: 'DEPTH', type: 'number', defaultValue: 2, description: 'Cut depth' },
          { name: 'STEPDOWN', type: 'number', defaultValue: 1, description: 'Depth per pass' },
          { name: 'FEED', type: 'number', defaultValue: 200, description: 'Feed rate' },
          {
            name: 'POCKET',
            type: 'number',
            defaultValue: 0,
            description: '1 for pocket, 0 for outline',
          },
        ],
        body: `G00 X#X_START Y#Y_START
#CURRENT_DEPTH = 0
WHILE #CURRENT_DEPTH < #DEPTH
  #PASS_DEPTH = #CURRENT_DEPTH + #STEPDOWN
  IF #PASS_DEPTH > #DEPTH
    #PASS_DEPTH = #DEPTH
  ENDIF
  G01 Z-#PASS_DEPTH F50
  
  IF #POCKET === 1
    ; Pocket machining (simplified)
    G01 X#X_START+#WIDTH F#FEED
    G01 Y#Y_START+#HEIGHT
    G01 X#X_START
    G01 Y#Y_START
  ELSE
    ; Outline cutting
    G01 X#X_START+#WIDTH F#FEED
    G01 Y#Y_START+#HEIGHT
    G01 X#X_START
    G01 Y#Y_START
  ENDIF
  
  #CURRENT_DEPTH = #PASS_DEPTH
ENDWHILE
G00 Z5`,
        tags: ['milling', 'rectangle', 'pocket', 'outline'],
        version: '1.0',
      },
      {
        name: 'CUT_CIRCLE',
        description: 'Cut a circular outline or pocket',
        parameters: [
          { name: 'X_CENTER', type: 'number', defaultValue: 0, description: 'Circle center X' },
          { name: 'Y_CENTER', type: 'number', defaultValue: 0, description: 'Circle center Y' },
          { name: 'RADIUS', type: 'number', defaultValue: 5, description: 'Circle radius' },
          { name: 'DEPTH', type: 'number', defaultValue: 2, description: 'Cut depth' },
          { name: 'STEPDOWN', type: 'number', defaultValue: 1, description: 'Depth per pass' },
          { name: 'FEED', type: 'number', defaultValue: 200, description: 'Feed rate' },
        ],
        body: `G00 X#X_CENTER+#RADIUS Y#Y_CENTER
#CURRENT_DEPTH = 0
WHILE #CURRENT_DEPTH < #DEPTH
  #PASS_DEPTH = #CURRENT_DEPTH + #STEPDOWN
  IF #PASS_DEPTH > #DEPTH
    #PASS_DEPTH = #DEPTH
  ENDIF
  G01 Z-#PASS_DEPTH F50
  G02 X#X_CENTER+#RADIUS Y#Y_CENTER I-#RADIUS J0 F#FEED
  #CURRENT_DEPTH = #PASS_DEPTH
ENDWHILE
G00 Z5`,
        tags: ['milling', 'circle', 'arc'],
        version: '1.0',
      },
    ]);

    // Tool Operations
    this.addCategory('tools', 'Tool Operations', [
      {
        name: 'TOOL_CHANGE',
        description: 'Automated tool change sequence',
        parameters: [
          { name: 'TOOL_NUM', type: 'number', defaultValue: 1, description: 'Tool number' },
          { name: 'SPINDLE_SPEED', type: 'number', defaultValue: 1000, description: 'Spindle RPM' },
          {
            name: 'Z_SAFE',
            type: 'number',
            defaultValue: 25,
            description: 'Safe Z height for tool change',
          },
        ],
        body: `M5                    ; Stop spindle
G00 Z#Z_SAFE         ; Move to safe Z
G00 X0 Y0            ; Move to tool change position
M6 T#TOOL_NUM        ; Change tool
M3 S#SPINDLE_SPEED   ; Start spindle`,
        tags: ['tools', 'change', 'spindle'],
        version: '1.0',
      },
      {
        name: 'PROBE_Z',
        description: 'Probe Z height at current position',
        parameters: [
          {
            name: 'PROBE_FEED',
            type: 'number',
            defaultValue: 10,
            description: 'Probing feed rate',
          },
          {
            name: 'MAX_DEPTH',
            type: 'number',
            defaultValue: 20,
            description: 'Maximum probe depth',
          },
          { name: 'Z_SAFE', type: 'number', defaultValue: 5, description: 'Safe retract height' },
        ],
        body: `G38.2 Z-#MAX_DEPTH F#PROBE_FEED  ; Probe down
G00 Z#Z_SAFE                     ; Retract to safe height
G10 L20 P0 Z0                    ; Set current Z as zero`,
        tags: ['probing', 'measurement', 'setup'],
        version: '1.0',
      },
    ]);

    // Utility Operations
    this.addCategory('utility', 'Utility Operations', [
      {
        name: 'PAUSE_MESSAGE',
        description: 'Pause program with message',
        parameters: [
          {
            name: 'MESSAGE',
            type: 'string',
            defaultValue: 'Paused',
            description: 'Message to display',
          },
        ],
        body: `M0 (#MESSAGE)`,
        tags: ['utility', 'pause', 'message'],
        version: '1.0',
      },
      {
        name: 'DWELL',
        description: 'Dwell (pause) for specified time',
        parameters: [
          { name: 'TIME', type: 'number', defaultValue: 1, description: 'Dwell time in seconds' },
        ],
        body: `G4 P#TIME`,
        tags: ['utility', 'time', 'pause'],
        version: '1.0',
      },
      {
        name: 'COOLANT_ON',
        description: 'Turn on coolant with options',
        parameters: [
          {
            name: 'TYPE',
            type: 'number',
            defaultValue: 8,
            description: 'Coolant type (8=flood, 7=mist)',
          },
        ],
        body: `M#TYPE`,
        tags: ['utility', 'coolant'],
        version: '1.0',
      },
    ]);

    logger.info('Macro library initialized', {
      categories: this.categories.size,
      totalMacros: this.getTotalMacroCount(),
    });
  }

  /**
   * Add a category of macros
   * @param {string} name - Category name
   * @param {string} description - Category description
   * @param {Array} macros - Array of macro definitions
   */
  addCategory(name, description, macros) {
    this.categories.set(name.toLowerCase(), {
      name: name.toLowerCase(),
      description,
      macros: macros.map(macro => ({
        ...macro,
        isBuiltIn: true,
        category: name.toLowerCase(),
        createdAt: new Date().toISOString(),
      })),
    });
  }

  /**
   * Get total number of macros across all categories
   * @returns {number} Total macro count
   */
  getTotalMacroCount() {
    let total = 0;
    for (const category of this.categories.values()) {
      total += category.macros.length;
    }
    return total;
  }

  /**
   * Export macro library to JSON
   * @returns {Object} Library data
   */
  exportLibrary() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      categories: this.getCategories(),
    };
  }

  /**
   * Import macro library from JSON
   * @param {Object} libraryData - Library data to import
   * @returns {boolean} Success
   */
  importLibrary(libraryData) {
    try {
      if (!libraryData.categories) {
        throw new Error('Invalid library format');
      }

      for (const category of libraryData.categories) {
        this.addCategory(category.name, category.description, category.macros);
      }

      logger.info('Imported macro library', {
        categories: libraryData.categories.length,
      });
      return true;
    } catch (error) {
      logger.error('Failed to import macro library', { error: error.message });
      return false;
    }
  }

  /**
   * Validate macro definition
   * @param {Object} macro - Macro to validate
   * @returns {Object} Validation result
   */
  validateMacro(macro) {
    const errors = [];
    const warnings = [];

    if (!macro.name || typeof macro.name !== 'string') {
      errors.push('Macro name is required');
    }

    if (!macro.body || typeof macro.body !== 'string') {
      errors.push('Macro body is required');
    }

    if (!Array.isArray(macro.parameters)) {
      warnings.push('Parameters should be an array');
      macro.parameters = [];
    }

    // Validate parameters
    for (let i = 0; i < macro.parameters.length; i++) {
      const param = macro.parameters[i];
      if (!param.name) {
        errors.push(`Parameter ${i + 1} missing name`);
      }
      if (param.type && !['number', 'string', 'boolean'].includes(param.type)) {
        warnings.push(`Parameter ${param.name} has unknown type: ${param.type}`);
      }
    }

    // Check for duplicate parameter names
    const paramNames = macro.parameters.map(p => p.name);
    const duplicates = paramNames.filter((name, index) => paramNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate parameter names: ${duplicates.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

module.exports = { MacroLibrary };
