#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdio.h>

static const char *base64_table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static void print_base64(const UInt8 *data, CFIndex length) {
    for (CFIndex i = 0; i < length; i += 3) {
        unsigned int value = ((unsigned int)data[i]) << 16;
        if (i + 1 < length) value |= ((unsigned int)data[i + 1]) << 8;
        if (i + 2 < length) value |= data[i + 2];
        putchar(base64_table[(value >> 18) & 63]);
        putchar(base64_table[(value >> 12) & 63]);
        putchar(i + 1 < length ? base64_table[(value >> 6) & 63] : '=');
        putchar(i + 2 < length ? base64_table[value & 63] : '=');
    }
    putchar('\n');
}

int main(void) {
    CFStringRef service = CFSTR("com.kakarrot.ai-employee-os.memory");
    CFStringRef account = CFSTR("master-key.v1");
    const void *query_keys[] = { kSecClass, kSecAttrService, kSecAttrAccount, kSecReturnData, kSecMatchLimit };
    const void *query_values[] = { kSecClassGenericPassword, service, account, kCFBooleanTrue, kSecMatchLimitOne };
    CFDictionaryRef query = CFDictionaryCreate(NULL, query_keys, query_values, 5, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching(query, &result);
    CFRelease(query);
    if (status == errSecSuccess) {
        CFDataRef data = (CFDataRef)result;
        if (CFDataGetLength(data) != 32) { CFRelease(result); return 3; }
        print_base64(CFDataGetBytePtr(data), CFDataGetLength(data));
        CFRelease(result);
        return 0;
    }
    if (status != errSecItemNotFound) return 4;

    UInt8 key[32];
    if (SecRandomCopyBytes(kSecRandomDefault, sizeof(key), key) != errSecSuccess) return 5;
    CFDataRef data = CFDataCreate(NULL, key, sizeof(key));
    const void *add_keys[] = { kSecClass, kSecAttrService, kSecAttrAccount, kSecValueData, kSecAttrAccessible };
    const void *add_values[] = { kSecClassGenericPassword, service, account, data, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly };
    CFDictionaryRef add = CFDictionaryCreate(NULL, add_keys, add_values, 5, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    status = SecItemAdd(add, NULL);
    CFRelease(add);
    CFRelease(data);
    if (status == errSecDuplicateItem) return main();
    if (status != errSecSuccess) return 6;
    print_base64(key, sizeof(key));
    return 0;
}
