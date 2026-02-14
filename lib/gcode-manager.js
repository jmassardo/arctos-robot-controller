const fs = require('fs-extra');
const path = require('path');
const { GCodeParser } = require('./gcode-parser');
const { logger } = require('./logger');

/**
 * Advanced G-code Manager
 * Provides G-code program management, execution control, and debugging capabilities
 */
class GCodeManager {
  constructor(config = {}) {
    this.config = {
      programsDir: path.join(__dirname, '../data/gcode-programs'),
      maxPrograms: 100,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      backupEnabled: true,
      ...config
    };

    this.parser = new GCodeParser();
    this.programs = new Map();
    this.executionState = {
      running: false,
      paused: false,
      currentProgram: null,
      currentLine: 0,
      totalLines: 0,
      startTime: null,
      breakpoints: new Set(),
      stepMode: false
    };

    this.init();
  }

  /**
   * Initialize the G-code manager
   */
  async init() {
    try {
      await fs.ensureDir(this.config.programsDir);
      await this.loadExistingPrograms();
      
      logger.info('GCodeManager initialized', {
        programsDir: this.config.programsDir,
        loadedPrograms: this.programs.size
      });
    } catch (error) {
      logger.error('Failed to initialize GCodeManager', { error: error.message });
      throw error;
    }
  }

  /**
   * Load existing G-code programs from disk
   */
  async loadExistingPrograms() {
    try {
      const files = await fs.readdir(this.config.programsDir);
      const gcodeFiles = files.filter(file => 
        file.endsWith('.gcode') || file.endsWith('.nc') || file.endsWith('.cnc')
      );

      for (const file of gcodeFiles) {
        const filePath = path.join(this.config.programsDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.size <= this.config.maxFileSize) {
          const content = await fs.readFile(filePath, 'utf8');
          const programId = path.parse(file).name;
          
          this.programs.set(programId, {
            id: programId,
            name: file,
            content,
            filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            parsed: null,
            validated: false
          });
        }
      }

      logger.info(`Loaded ${this.programs.size} G-code programs`);
    } catch (error) {
      logger.warn('Error loading existing programs', { error: error.message });
    }
  }

  /**
   * Create a new G-code program
   * @param {string} name - Program name
   * @param {string} content - G-code content
   * @param {Object} metadata - Program metadata
   * @returns {Object} Created program
   */
  async createProgram(name, content, metadata = {}) {
    try {
      if (this.programs.size >= this.config.maxPrograms) {
        throw new Error(`Maximum number of programs (${this.config.maxPrograms}) reached`);
      }

      if (content.length > this.config.maxFileSize) {
        throw new Error(`Program size exceeds maximum of ${this.config.maxFileSize} bytes`);
      }

      const programId = this.generateProgramId(name);
      const fileName = `${programId}.gcode`;
      const filePath = path.join(this.config.programsDir, fileName);

      // Validate G-code syntax
      const validation = this.parser.validateSyntax(content);
      if (!validation.valid && validation.errors.length > 0) {
        logger.warn('G-code program has validation errors', {
          programId,
          errors: validation.errors.length,
          warnings: validation.warnings.length
        });
      }

      // Save to disk
      await fs.writeFile(filePath, content, 'utf8');

      const program = {
        id: programId,
        name: name,
        content: content,
        filePath: filePath,
        size: content.length,
        created: new Date(),
        modified: new Date(),
        metadata: {
          description: metadata.description || '',
          author: metadata.author || 'system',
          version: metadata.version || '1.0',
          ...metadata
        },
        validation,
        parsed: null,
        statistics: {
          executionCount: 0,
          lastExecuted: null,
          totalExecutionTime: 0,
          averageExecutionTime: 0
        }
      };

      this.programs.set(programId, program);

      logger.robot('G-code program created', {
        programId,
        name,
        size: content.length,
        valid: validation.valid
      });

      return { success: true, program };
    } catch (error) {
      logger.error('Failed to create G-code program', {
        name,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Update an existing G-code program
   * @param {string} programId - Program ID
   * @param {Object} updates - Updates to apply
   * @returns {Object} Update result
   */
  async updateProgram(programId, updates) {
    try {
      const program = this.programs.get(programId);
      if (!program) {
        throw new Error(`Program ${programId} not found`);
      }

      let contentChanged = false;

      // Update content if provided
      if (updates.content !== undefined) {
        if (updates.content.length > this.config.maxFileSize) {
          throw new Error(`Program size exceeds maximum of ${this.config.maxFileSize} bytes`);
        }

        // Validate new content
        const validation = this.parser.validateSyntax(updates.content);
        program.content = updates.content;
        program.validation = validation;
        program.parsed = null; // Reset parsed data
        contentChanged = true;
      }

      // Update metadata
      if (program.name = updates.name) {
        ;
      }
      if (updates.metadata) {
        program.metadata = { ...program.metadata, ...updates.metadata };
      }

      program.modified = new Date();

      // Save to disk if content changed
      if (contentChanged) {
        await fs.writeFile(program.filePath, program.content, 'utf8');
        program.size = program.content.length;
      }

      this.programs.set(programId, program);

      logger.robot('G-code program updated', {
        programId,
        contentChanged,
        size: program.size
      });

      return { success: true, program };
    } catch (error) {
      logger.error('Failed to update G-code program', {
        programId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a G-code program
   * @param {string} programId - Program ID
   * @returns {Object} Delete result
   */
  async deleteProgram(programId) {
    try {
      const program = this.programs.get(programId);
      if (!program) {
        throw new Error(`Program ${programId} not found`);
      }

      // Create backup if enabled
      if (this.config.backupEnabled) {
        const backupPath = `${program.filePath}.backup.${Date.now()}`;
        await fs.copy(program.filePath, backupPath);
      }

      // Delete from disk
      await fs.remove(program.filePath);

      // Remove from memory
      this.programs.delete(programId);

      logger.robot('G-code program deleted', { programId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete G-code program', {
        programId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a G-code program
   * @param {string} programId - Program ID
   * @returns {Object} Program data
   */
  getProgram(programId) {
    const program = this.programs.get(programId);
    if (!program) {
      return { success: false, error: `Program ${programId} not found` };
    }

    return { success: true, program };
  }

  /**
   * List all G-code programs
   * @param {Object} options - Listing options
   * @returns {Object} Programs list
   */
  listPrograms(options = {}) {
    const programs = Array.from(this.programs.values());
    
    let filtered = programs;

    // Apply filters
    if (options.valid !== undefined) {
      filtered = filtered.filter(p => p.validation?.valid === options.valid);
    }

    if (options.search) {
      const searchTerm = options.search.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchTerm) ||
        (p.metadata?.description || '').toLowerCase().includes(searchTerm)
      );
    }

    // Apply sorting
    if (options.sortBy) {
      const sortField = options.sortBy;
      const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
      
      filtered.sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];
        
        if (sortField === 'created' || sortField === 'modified') {
          aVal = new Date(aVal);
          bVal = new Date(bVal);
        }
        
        if (aVal < bVal) {
          return -sortOrder;
        }
        if (aVal > bVal) {
          return sortOrder;
        }
        return 0;
      });
    }

    // Apply pagination
    const total = filtered.length;
    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;
    
    const paginated = filtered.slice(offset, offset + limit);

    return {
      success: true,
      programs: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Parse and validate a G-code program
   * @param {string} programId - Program ID
   * @param {Object} options - Parsing options
   * @returns {Object} Parse results
   */
  async parseProgram(programId, options = {}) {
    try {
      const program = this.programs.get(programId);
      if (!program) {
        throw new Error(`Program ${programId} not found`);
      }

      // Parse the program
      const parseResult = await this.parser.parse(program.content, options);
      
      // Cache parsed data
      program.parsed = parseResult;
      program.validation = {
        valid: parseResult.success,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        lineCount: parseResult.statistics.totalLines
      };

      this.programs.set(programId, program);

      logger.robot('G-code program parsed', {
        programId,
        success: parseResult.success,
        totalLines: parseResult.statistics.totalLines,
        errors: parseResult.errors.length,
        warnings: parseResult.warnings.length
      });

      return { success: true, parseResult };
    } catch (error) {
      logger.error('Failed to parse G-code program', {
        programId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get program execution state
   * @returns {Object} Execution state
   */
  getExecutionState() {
    return {
      running: this.executionState.running,
      paused: this.executionState.paused,
      currentProgram: this.executionState.currentProgram,
      currentLine: this.executionState.currentLine,
      totalLines: this.executionState.totalLines,
      progress: this.executionState.totalLines > 0 ? 
        Math.round((this.executionState.currentLine / this.executionState.totalLines) * 100) : 0,
      elapsedTime: this.executionState.startTime ? 
        Math.round((Date.now() - this.executionState.startTime) / 1000) : 0,
      stepMode: this.executionState.stepMode,
      breakpoints: Array.from(this.executionState.breakpoints)
    };
  }

  /**
   * Set execution breakpoints
   * @param {Array} lineNumbers - Line numbers to set breakpoints on
   * @returns {Object} Result
   */
  setBreakpoints(lineNumbers) {
    try {
      this.executionState.breakpoints = new Set(lineNumbers.map(n => parseInt(n)));
      
      logger.robot('G-code breakpoints set', {
        breakpoints: Array.from(this.executionState.breakpoints)
      });

      return { success: true, breakpoints: Array.from(this.executionState.breakpoints) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Toggle step-by-step execution mode
   * @param {boolean} enabled - Enable step mode
   * @returns {Object} Result
   */
  setStepMode(enabled) {
    this.executionState.stepMode = enabled;
    
    logger.robot('G-code step mode changed', { enabled });
    
    return { success: true, stepMode: enabled };
  }

  /**
   * Generate unique program ID
   * @param {string} name - Program name
   * @returns {string} Program ID
   */
  generateProgramId(name) {
    const baseName = name.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    let programId = baseName;
    let counter = 1;

    while (this.programs.has(programId)) {
      programId = `${baseName}_${counter}`;
      counter++;
    }

    return programId;
  }

  /**
   * Import G-code program from file
   * @param {string} filePath - Path to G-code file
   * @param {Object} metadata - Program metadata
   * @returns {Object} Import result
   */
  async importProgram(filePath, metadata = {}) {
    try {
      if (!await fs.pathExists(filePath)) {
        throw new Error(`File ${filePath} not found`);
      }

      const stats = await fs.stat(filePath);
      if (stats.size > this.config.maxFileSize) {
        throw new Error(`File size ${stats.size} exceeds maximum ${this.config.maxFileSize} bytes`);
      }

      const content = await fs.readFile(filePath, 'utf8');
      const fileName = path.basename(filePath);
      const programName = metadata.name || path.parse(fileName).name;

      return await this.createProgram(programName, content, {
        ...metadata,
        importedFrom: filePath,
        originalFileName: fileName
      });
    } catch (error) {
      logger.error('Failed to import G-code program', {
        filePath,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Export G-code program to file
   * @param {string} programId - Program ID
   * @param {string} exportPath - Export file path
   * @returns {Object} Export result
   */
  async exportProgram(programId, exportPath) {
    try {
      const program = this.programs.get(programId);
      if (!program) {
        throw new Error(`Program ${programId} not found`);
      }

      await fs.ensureDir(path.dirname(exportPath));
      await fs.writeFile(exportPath, program.content, 'utf8');

      logger.robot('G-code program exported', {
        programId,
        exportPath,
        size: program.size
      });

      return { success: true, exportPath };
    } catch (error) {
      logger.error('Failed to export G-code program', {
        programId,
        exportPath,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get program statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    const programs = Array.from(this.programs.values());
    
    const stats = {
      totalPrograms: programs.length,
      totalSize: programs.reduce((sum, p) => sum + p.size, 0),
      validPrograms: programs.filter(p => p.validation?.valid).length,
      programsWithErrors: programs.filter(p => p.validation?.errors?.length > 0).length,
      programsWithWarnings: programs.filter(p => p.validation?.warnings?.length > 0).length,
      averageSize: programs.length > 0 ? Math.round(programs.reduce((sum, p) => sum + p.size, 0) / programs.length) : 0,
      totalExecutions: programs.reduce((sum, p) => sum + (p.statistics?.executionCount || 0), 0),
      totalExecutionTime: programs.reduce((sum, p) => sum + (p.statistics?.totalExecutionTime || 0), 0)
    };

    return stats;
  }

  /**
   * Cleanup old backup files
   * @param {number} daysOld - Remove backups older than this many days
   * @returns {Object} Cleanup result
   */
  async cleanupBackups(daysOld = 30) {
    try {
      const files = await fs.readdir(this.config.programsDir);
      const backupFiles = files.filter(file => file.includes('.backup.'));
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      
      let removedCount = 0;
      
      for (const file of backupFiles) {
        const filePath = path.join(this.config.programsDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.remove(filePath);
          removedCount++;
        }
      }

      logger.info('Backup cleanup completed', {
        removedCount,
        daysOld
      });

      return { success: true, removedCount };
    } catch (error) {
      logger.error('Backup cleanup failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Shutdown the manager
   */
  async shutdown() {
    logger.info('GCodeManager shutting down');
    this.programs.clear();
  }
}

module.exports = { GCodeManager };