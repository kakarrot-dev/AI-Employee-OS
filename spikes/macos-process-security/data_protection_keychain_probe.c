#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef PROBE_VARIANT
#define PROBE_VARIANT 0
#endif

static const char *fixture_secret = "phase0-apple-profile-fixture-not-a-user-credential";

static CFStringRef string_from_utf8(const char *value) {
    return CFStringCreateWithCString(kCFAllocatorDefault, value, kCFStringEncodingUTF8);
}

static CFMutableDictionaryRef base_query(const char *group, const char *service,
                                         const char *account) {
    CFMutableDictionaryRef query = CFDictionaryCreateMutable(
        kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks);
    if (query == NULL) {
        return NULL;
    }

    CFStringRef group_value = string_from_utf8(group);
    CFStringRef service_value = string_from_utf8(service);
    CFStringRef account_value = string_from_utf8(account);
    if (group_value == NULL || service_value == NULL || account_value == NULL) {
        if (group_value != NULL) CFRelease(group_value);
        if (service_value != NULL) CFRelease(service_value);
        if (account_value != NULL) CFRelease(account_value);
        CFRelease(query);
        return NULL;
    }

    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);
    CFDictionarySetValue(query, kSecAttrAccessGroup, group_value);
    CFDictionarySetValue(query, kSecAttrService, service_value);
    CFDictionarySetValue(query, kSecAttrAccount, account_value);
    CFDictionarySetValue(query, kSecUseDataProtectionKeychain, kCFBooleanTrue);
    CFRelease(group_value);
    CFRelease(service_value);
    CFRelease(account_value);
    return query;
}

static int print_failure(const char *operation, OSStatus status) {
    fprintf(stderr, "%s_failed status=%d variant=%d\n", operation, (int)status,
            PROBE_VARIANT);
    return 1;
}

static int put_item(const char *group, const char *service, const char *account) {
    CFMutableDictionaryRef query = base_query(group, service, account);
    if (query == NULL) return 70;

    OSStatus delete_status = SecItemDelete(query);
    if (delete_status != errSecSuccess && delete_status != errSecItemNotFound) {
        CFRelease(query);
        return print_failure("delete_before_put", delete_status);
    }

    CFDataRef data = CFDataCreate(kCFAllocatorDefault,
                                  (const UInt8 *)fixture_secret,
                                  (CFIndex)strlen(fixture_secret));
    if (data == NULL) {
        CFRelease(query);
        return 71;
    }
    CFDictionarySetValue(query, kSecValueData, data);
    CFDictionarySetValue(query, kSecAttrAccessible,
                         kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly);
    OSStatus status = SecItemAdd(query, NULL);
    CFRelease(data);
    CFRelease(query);
    if (status != errSecSuccess) return print_failure("put", status);
    printf("put_ok bytes=%zu variant=%d\n", strlen(fixture_secret), PROBE_VARIANT);
    return 0;
}

static int read_item(const char *group, const char *service, const char *account) {
    CFMutableDictionaryRef query = base_query(group, service, account);
    if (query == NULL) return 70;
    CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
    CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);

    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching(query, &result);
    CFRelease(query);
    if (status != errSecSuccess) return print_failure("read", status);
    if (result == NULL || CFGetTypeID(result) != CFDataGetTypeID()) {
        if (result != NULL) CFRelease(result);
        fprintf(stderr, "read_failed unexpected_result variant=%d\n", PROBE_VARIANT);
        return 72;
    }
    CFIndex length = CFDataGetLength((CFDataRef)result);
    CFRelease(result);
    if (length != (CFIndex)strlen(fixture_secret)) {
        fprintf(stderr, "read_failed unexpected_length variant=%d\n", PROBE_VARIANT);
        return 73;
    }
    printf("read_ok bytes=%ld variant=%d\n", (long)length, PROBE_VARIANT);
    return 0;
}

static int delete_item(const char *group, const char *service, const char *account) {
    CFMutableDictionaryRef query = base_query(group, service, account);
    if (query == NULL) return 70;
    OSStatus status = SecItemDelete(query);
    CFRelease(query);
    if (status != errSecSuccess && status != errSecItemNotFound) {
        return print_failure("delete", status);
    }
    printf("delete_ok variant=%d\n", PROBE_VARIANT);
    return 0;
}

int main(int argc, char **argv) {
    if (argc != 5) {
        fprintf(stderr,
                "usage: %s <put|read|delete> <access-group> <service> <account>\n",
                argv[0]);
        return 64;
    }
    if (strcmp(argv[1], "put") == 0) {
        return put_item(argv[2], argv[3], argv[4]);
    }
    if (strcmp(argv[1], "read") == 0) {
        return read_item(argv[2], argv[3], argv[4]);
    }
    if (strcmp(argv[1], "delete") == 0) {
        return delete_item(argv[2], argv[3], argv[4]);
    }
    fprintf(stderr, "unknown operation\n");
    return 65;
}
