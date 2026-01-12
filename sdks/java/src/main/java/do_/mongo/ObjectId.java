package do_.mongo;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * MongoDB ObjectId implementation.
 * <p>
 * An ObjectId is a 12-byte unique identifier that consists of:
 * <ul>
 *   <li>4-byte timestamp (seconds since Unix epoch)</li>
 *   <li>5-byte random value</li>
 *   <li>3-byte incrementing counter</li>
 * </ul>
 * </p>
 */
public final class ObjectId implements Comparable<ObjectId> {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final AtomicInteger COUNTER = new AtomicInteger(RANDOM.nextInt());
    private static final byte[] MACHINE_ID = createMachineId();

    private final byte[] bytes;

    /**
     * Creates a new ObjectId with automatically generated value.
     */
    public ObjectId() {
        this.bytes = generate();
    }

    /**
     * Creates an ObjectId from a hex string.
     *
     * @param hexString a 24-character hex string
     * @throws IllegalArgumentException if the string is not a valid ObjectId
     */
    public ObjectId(String hexString) {
        if (hexString == null || hexString.length() != 24) {
            throw new IllegalArgumentException("Invalid ObjectId hex string: " + hexString);
        }
        this.bytes = parseHexString(hexString);
    }

    /**
     * Creates an ObjectId from raw bytes.
     *
     * @param bytes a 12-byte array
     * @throws IllegalArgumentException if bytes is not exactly 12 bytes
     */
    public ObjectId(byte[] bytes) {
        if (bytes == null || bytes.length != 12) {
            throw new IllegalArgumentException("ObjectId must be 12 bytes");
        }
        this.bytes = bytes.clone();
    }

    /**
     * Generates a new ObjectId byte array.
     */
    private static byte[] generate() {
        byte[] bytes = new byte[12];
        ByteBuffer buffer = ByteBuffer.wrap(bytes);

        // 4-byte timestamp
        int timestamp = (int) (System.currentTimeMillis() / 1000);
        buffer.putInt(timestamp);

        // 5-byte machine/process id
        buffer.put(MACHINE_ID, 0, 5);

        // 3-byte counter
        int counter = COUNTER.getAndIncrement();
        bytes[9] = (byte) (counter >> 16);
        bytes[10] = (byte) (counter >> 8);
        bytes[11] = (byte) counter;

        return bytes;
    }

    /**
     * Creates a 5-byte machine identifier.
     */
    private static byte[] createMachineId() {
        byte[] machineId = new byte[5];
        RANDOM.nextBytes(machineId);
        return machineId;
    }

    /**
     * Parses a hex string into bytes.
     */
    private static byte[] parseHexString(String hex) {
        byte[] bytes = new byte[12];
        for (int i = 0; i < 12; i++) {
            bytes[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    /**
     * Returns the timestamp component as seconds since epoch.
     *
     * @return the timestamp in seconds
     */
    public int getTimestamp() {
        return ((bytes[0] & 0xff) << 24)
                | ((bytes[1] & 0xff) << 16)
                | ((bytes[2] & 0xff) << 8)
                | (bytes[3] & 0xff);
    }

    /**
     * Returns the ObjectId as a 24-character hex string.
     *
     * @return the hex string representation
     */
    public String toHexString() {
        StringBuilder sb = new StringBuilder(24);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }

    /**
     * Returns a copy of the raw bytes.
     *
     * @return a 12-byte array
     */
    public byte[] toByteArray() {
        return bytes.clone();
    }

    /**
     * Creates a new ObjectId.
     *
     * @return a new ObjectId
     */
    public static ObjectId get() {
        return new ObjectId();
    }

    /**
     * Checks if a string is a valid ObjectId hex string.
     *
     * @param hexString the string to check
     * @return true if valid
     */
    public static boolean isValid(String hexString) {
        if (hexString == null || hexString.length() != 24) {
            return false;
        }
        for (char c : hexString.toCharArray()) {
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
                return false;
            }
        }
        return true;
    }

    @Override
    public String toString() {
        return toHexString();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ObjectId objectId = (ObjectId) o;
        return java.util.Arrays.equals(bytes, objectId.bytes);
    }

    @Override
    public int hashCode() {
        return java.util.Arrays.hashCode(bytes);
    }

    @Override
    public int compareTo(ObjectId other) {
        if (other == null) return 1;
        for (int i = 0; i < 12; i++) {
            int cmp = (bytes[i] & 0xff) - (other.bytes[i] & 0xff);
            if (cmp != 0) return cmp;
        }
        return 0;
    }
}
