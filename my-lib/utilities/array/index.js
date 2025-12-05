/**
 * Array manipulation utilities for Lambda functions
 * Provides common array operations used across lambda modules
 */
class ArrayHelper {
    /**
     * Get distinct values from an array based on a specific key
     * @param {Array} arr - Array of objects
     * @param {string} key - Key to extract distinct values from
     * @returns {Array} Array of distinct values
     */
    static distinctValues(arr, key) {
        const uniqueValues = arr
            .map((item) => item[key])
            .filter(
                (value, index, currentValue) => currentValue.indexOf(value) === index
            );
        return uniqueValues;
    }

    /**
     * Group array elements by a specific key
     * @param {Array} arr - Array of objects to group
     * @param {string} key - Key to group by
     * @returns {Object} Object with keys as group names and values as arrays of grouped items
     */
    static groupBy(arr, key) {
        return arr.reduce(function(rv, x) {
            (rv[x[key]] = rv[x[key]] || []).push(x);
            return rv;
        }, {});
    }

    /**
     * Get distinct objects from an array based on a specific key
     * @param {Array} arr - Array of objects
     * @param {string} key - Key to use for uniqueness comparison
     * @returns {Array} Array of distinct objects
     */
    static distinctObjects(arr, key) {
        const seen = new Set();
        return arr.filter(item => {
            const keyValue = item[key];
            if (seen.has(keyValue)) {
                return false;
            }
            seen.add(keyValue);
            return true;
        });
    }

    /**
     * Sort array by a specific key
     * @param {Array} arr - Array of objects to sort
     * @param {string} key - Key to sort by
     * @param {boolean} ascending - Sort in ascending order (default: true)
     * @returns {Array} Sorted array
     */
    static sortBy(arr, key, ascending = true) {
        return [...arr].sort((a, b) => {
            const aVal = a[key];
            const bVal = b[key];
            
            if (aVal < bVal) return ascending ? -1 : 1;
            if (aVal > bVal) return ascending ? 1 : -1;
            return 0;
        });
    }

    /**
     * Filter array by multiple criteria
     * @param {Array} arr - Array to filter
     * @param {Object} criteria - Object with key-value pairs for filtering
     * @returns {Array} Filtered array
     */
    static filterBy(arr, criteria) {
        return arr.filter(item => {
            return Object.keys(criteria).every(key => {
                return item[key] === criteria[key];
            });
        });
    }

    /**
     * Chunk array into smaller arrays of specified size
     * @param {Array} arr - Array to chunk
     * @param {number} size - Size of each chunk
     * @returns {Array} Array of chunks
     */
    static chunk(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Flatten nested arrays
     * @param {Array} arr - Array to flatten
     * @param {number} depth - Depth to flatten (default: 1)
     * @returns {Array} Flattened array
     */
    static flatten(arr, depth = 1) {
        return depth > 0 
            ? arr.reduce((acc, val) => acc.concat(Array.isArray(val) ? this.flatten(val, depth - 1) : val), [])
            : arr.slice();
    }

    /**
     * Remove duplicates from array
     * @param {Array} arr - Array to remove duplicates from
     * @returns {Array} Array without duplicates
     */
    static unique(arr) {
        return [...new Set(arr)];
    }

    /**
     * Find intersection of two arrays
     * @param {Array} arr1 - First array
     * @param {Array} arr2 - Second array
     * @returns {Array} Array of common elements
     */
    static intersection(arr1, arr2) {
        return arr1.filter(item => arr2.includes(item));
    }

    /**
     * Find difference between two arrays
     * @param {Array} arr1 - First array
     * @param {Array} arr2 - Second array
     * @returns {Array} Array of elements in arr1 but not in arr2
     */
    static difference(arr1, arr2) {
        return arr1.filter(item => !arr2.includes(item));
    }

    /**
     * Shuffle array randomly
     * @param {Array} arr - Array to shuffle
     * @returns {Array} Shuffled array
     */
    static shuffle(arr) {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Get random element from array
     * @param {Array} arr - Array to get random element from
     * @returns {*} Random element from array
     */
    static random(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /**
     * Check if array is empty
     * @param {Array} arr - Array to check
     * @returns {boolean} True if array is empty or null/undefined
     */
    static isEmpty(arr) {
        return !arr || arr.length === 0;
    }

    /**
     * Get the sum of numeric values in array
     * @param {Array} arr - Array of numbers or objects
     * @param {string} key - Key to sum by (for objects)
     * @returns {number} Sum of values
     */
    static sum(arr, key = null) {
        if (key) {
            return arr.reduce((sum, item) => sum + (item[key] || 0), 0);
        }
        return arr.reduce((sum, item) => sum + item, 0);
    }

    /**
     * Get the average of numeric values in array
     * @param {Array} arr - Array of numbers or objects
     * @param {string} key - Key to average by (for objects)
     * @returns {number} Average of values
     */
    static average(arr, key = null) {
        if (this.isEmpty(arr)) return 0;
        return this.sum(arr, key) / arr.length;
    }

    /**
     * Find min value in array
     * @param {Array} arr - Array of numbers or objects
     * @param {string} key - Key to find min by (for objects)
     * @returns {*} Minimum value or object
     */
    static min(arr, key = null) {
        if (this.isEmpty(arr)) return null;
        if (key) {
            return arr.reduce((min, item) => (item[key] < min[key] ? item : min));
        }
        return Math.min(...arr);
    }

    /**
     * Find max value in array
     * @param {Array} arr - Array of numbers or objects
     * @param {string} key - Key to find max by (for objects)
     * @returns {*} Maximum value or object
     */
    static max(arr, key = null) {
        if (this.isEmpty(arr)) return null;
        if (key) {
            return arr.reduce((max, item) => (item[key] > max[key] ? item : max));
        }
        return Math.max(...arr);
    }
}

export default ArrayHelper;

// Export for backward compatibility and convenience with proper binding
export const distinctValues = ArrayHelper.distinctValues.bind(ArrayHelper);
export const groupBy = ArrayHelper.groupBy.bind(ArrayHelper);
export const distinctObjects = ArrayHelper.distinctObjects.bind(ArrayHelper);
export const sortBy = ArrayHelper.sortBy.bind(ArrayHelper);
export const filterBy = ArrayHelper.filterBy.bind(ArrayHelper);
export const chunk = ArrayHelper.chunk.bind(ArrayHelper);
export const flatten = ArrayHelper.flatten.bind(ArrayHelper);
export const unique = ArrayHelper.unique.bind(ArrayHelper);
export const intersection = ArrayHelper.intersection.bind(ArrayHelper);
export const difference = ArrayHelper.difference.bind(ArrayHelper);
export const shuffle = ArrayHelper.shuffle.bind(ArrayHelper);
export const random = ArrayHelper.random.bind(ArrayHelper);
export const isEmpty = ArrayHelper.isEmpty.bind(ArrayHelper);
export const sum = ArrayHelper.sum.bind(ArrayHelper);
export const average = ArrayHelper.average.bind(ArrayHelper);
export const min = ArrayHelper.min.bind(ArrayHelper);
export const max = ArrayHelper.max.bind(ArrayHelper);