
/**
 * 
 * Create a customized Error with error description
 * 
 * Usage:
 * ```js
 * const myError = new BaseError('A message', {
 *   cause: new Error('Caused by another error'), 
 *   desc: "A description"
 * });
 * ```
 * 
 * @param message 
 * @param options 
 */
export const CommonError = class extends Error{

    constructor(message, options = {}) {
        if (!options.cause) {
            delete options.cause;
        }
        super(message, options);
        this.desc = options.desc;
    }

}