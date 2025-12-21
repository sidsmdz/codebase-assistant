package com.enterprise.erp.shared.utils;

import java.util.regex.Pattern;
import java.util.regex.Matcher;

/**
 * Shared validation utilities used across all services
 * Ensures consistent validation logic throughout the system
 */
public class ValidationUtils {

    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"
    );

    private static final Pattern PHONE_PATTERN = Pattern.compile(
            "^\\+?[1-9]\\d{1,14}$"
    );

    private static final Pattern USERNAME_PATTERN = Pattern.compile(
            "^[a-zA-Z0-9_]{3,20}$"
    );

    private static final Pattern CREDIT_CARD_PATTERN = Pattern.compile(
            "^[0-9]{13,19}$"
    );

    /**
     * Validates email address format
     */
    public static boolean isValidEmail(String email) {
        if (email == null || email.trim().isEmpty()) {
            return false;
        }
        Matcher matcher = EMAIL_PATTERN.matcher(email);
        return matcher.matches();
    }

    /**
     * Validates phone number format (international format)
     */
    public static boolean isValidPhone(String phone) {
        if (phone == null || phone.trim().isEmpty()) {
            return false;
        }
        String cleanPhone = phone.replaceAll("[\\s()-]", "");
        Matcher matcher = PHONE_PATTERN.matcher(cleanPhone);
        return matcher.matches();
    }

    /**
     * Validates username format (alphanumeric and underscore, 3-20 chars)
     */
    public static boolean isValidUsername(String username) {
        if (username == null || username.trim().isEmpty()) {
            return false;
        }
        Matcher matcher = USERNAME_PATTERN.matcher(username);
        return matcher.matches();
    }

    /**
     * Validates credit card number using Luhn algorithm
     */
    public static boolean isValidCreditCard(String cardNumber) {
        if (cardNumber == null || cardNumber.trim().isEmpty()) {
            return false;
        }

        String cleanCard = cardNumber.replaceAll("\\s+", "");
        Matcher matcher = CREDIT_CARD_PATTERN.matcher(cleanCard);
        if (!matcher.matches()) {
            return false;
        }

        return luhnCheck(cleanCard);
    }

    /**
     * Luhn algorithm for credit card validation
     */
    private static boolean luhnCheck(String cardNumber) {
        int sum = 0;
        boolean alternate = false;

        for (int i = cardNumber.length() - 1; i >= 0; i--) {
            int n = Integer.parseInt(cardNumber.substring(i, i + 1));

            if (alternate) {
                n *= 2;
                if (n > 9) {
                    n = (n % 10) + 1;
                }
            }

            sum += n;
            alternate = !alternate;
        }

        return (sum % 10 == 0);
    }

    /**
     * Validates password strength
     * Must contain: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
     */
    public static boolean isStrongPassword(String password) {
        if (password == null || password.length() < 8) {
            return false;
        }

        boolean hasUpper = false;
        boolean hasLower = false;
        boolean hasDigit = false;
        boolean hasSpecial = false;

        for (char c : password.toCharArray()) {
            if (Character.isUpperCase(c)) hasUpper = true;
            else if (Character.isLowerCase(c)) hasLower = true;
            else if (Character.isDigit(c)) hasDigit = true;
            else hasSpecial = true;
        }

        return hasUpper && hasLower && hasDigit && hasSpecial;
    }

    /**
     * Validates price value (positive, max 2 decimal places)
     */
    public static boolean isValidPrice(String price) {
        if (price == null || price.trim().isEmpty()) {
            return false;
        }

        try {
            double value = Double.parseDouble(price);
            if (value <= 0) {
                return false;
            }

            String[] parts = price.split("\\.");
            if (parts.length == 2 && parts[1].length() > 2) {
                return false;
            }

            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /**
     * Validates quantity (positive integer)
     */
    public static boolean isValidQuantity(Integer quantity) {
        return quantity != null && quantity > 0;
    }

    /**
     * Sanitizes string input to prevent XSS
     */
    public static String sanitize(String input) {
        if (input == null) {
            return null;
        }

        return input
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#x27;")
                .replace("/", "&#x2F;");
    }

    /**
     * Validates not null and not empty
     */
    public static boolean isNotEmpty(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /**
     * Validates string length within range
     */
    public static boolean isLengthValid(String value, int min, int max) {
        if (value == null) {
            return false;
        }
        int length = value.length();
        return length >= min && length <= max;
    }
}
