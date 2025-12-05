/**
 * Date formatting utilities for Lambda functions
 * Provides consistent date formatting across all lambda modules
 */
class DateHelper {
    /**
     * Format a date to full datetime string (YYYY-MM-DDTHH:mm:ss)
     * @param {Date} date - Date object to format
     * @returns {string} Formatted datetime string in ISO-like format without timezone
     */
    static dateTimeFullFormatToString(date) {
        const mm = date.getMonth() + 1; // getMonth() is zero-based
        const dd = date.getDate();
        const hh = date.getHours();
        const mi = date.getMinutes();
        const ss = date.getSeconds();

        return [
            date.getFullYear(),
            '-',
            (mm > 9 ? '' : '0') + mm,
            '-',
            (dd > 9 ? '' : '0') + dd,
            'T',
            (hh > 9 ? '' : '0') + hh,
            ':',
            (mi > 9 ? '' : '0') + mi,
            ':',
            (ss > 9 ? '' : '0') + ss
        ].join('');
    }

    /**
     * Format a date to date-only string (YYYY-MM-DD)
     * @param {Date} date - Date object to format
     * @returns {string} Formatted date string
     */
    static dateFormatToString(date) {
        const mm = date.getMonth() + 1; // getMonth() is zero-based
        const dd = date.getDate();

        return [
            date.getFullYear(),
            '-',
            (mm > 9 ? '' : '0') + mm,
            '-',
            (dd > 9 ? '' : '0') + dd
        ].join('');
    }

    /**
     * Get current date formatted as full datetime string
     * @returns {string} Current datetime in YYYY-MM-DDTHH:mm:ss format
     */
    static getCurrentDateTimeString() {
        return this.dateTimeFullFormatToString(new Date());
    }

    /**
     * Get current date formatted as date-only string
     * @returns {string} Current date in YYYY-MM-DD format
     */
    static getCurrentDateString() {
        return this.dateFormatToString(new Date());
    }

    /**
     * Parse a date string and return formatted datetime string
     * @param {string} dateString - Date string to parse
     * @returns {string} Formatted datetime string
     */
    static parseDateToFullFormat(dateString) {
        return this.dateTimeFullFormatToString(new Date(dateString));
    }

    /**
     * Parse a date string and return formatted date string
     * @param {string} dateString - Date string to parse
     * @returns {string} Formatted date string
     */
    static parseDateToDateFormat(dateString) {
        return this.dateFormatToString(new Date(dateString));
    }

    /**
     * Add days to a date
     * @param {Date} date - Date object
     * @param {number} days - Number of days to add
     * @returns {Date} New date with days added
     */
    static addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    /**
     * Add hours to a date
     * @param {Date} date - Date object
     * @param {number} hours - Number of hours to add
     * @returns {Date} New date with hours added
     */
    static addHours(date, hours) {
        const result = new Date(date);
        result.setHours(result.getHours() + hours);
        return result;
    }

    /**
     * Check if a date is today
     * @param {Date} date - Date to check
     * @returns {boolean} True if date is today
     */
    static isToday(date) {
        const today = new Date();
        return this.dateFormatToString(date) === this.dateFormatToString(today);
    }

    /**
     * Get the difference in days between two dates
     * @param {Date} date1 - First date
     * @param {Date} date2 - Second date
     * @returns {number} Difference in days
     */
    static daysDifference(date1, date2) {
        const timeDiff = Math.abs(date2.getTime() - date1.getTime());
        return Math.ceil(timeDiff / (1000 * 3600 * 24));
    }

    /**
     * Format date for display (DD/MM/YYYY)
     * @param {Date} date - Date object to format
     * @returns {string} Formatted date string for display
     */
    static formatForDisplay(date) {
        const mm = date.getMonth() + 1;
        const dd = date.getDate();
        const yyyy = date.getFullYear();

        return [
            (dd > 9 ? '' : '0') + dd,
            '/',
            (mm > 9 ? '' : '0') + mm,
            '/',
            yyyy
        ].join('');
    }

    /**
     * Format datetime for display (DD/MM/YYYY HH:mm)
     * @param {Date} date - Date object to format
     * @returns {string} Formatted datetime string for display
     */
    static formatDateTimeForDisplay(date) {
        const dateStr = this.formatForDisplay(date);
        const hh = date.getHours();
        const mi = date.getMinutes();

        return `${dateStr} ${(hh > 9 ? '' : '0') + hh}:${(mi > 9 ? '' : '0') + mi}`;
    }
}

export default DateHelper;

// Export for backward compatibility and convenience
export const {
    dateTimeFullFormatToString,
    dateFormatToString,
    getCurrentDateTimeString,
    getCurrentDateString,
    parseDateToFullFormat,
    parseDateToDateFormat,
    addDays,
    addHours,
    isToday,
    daysDifference,
    formatForDisplay,
    formatDateTimeForDisplay
} = DateHelper;